// src/app/api/woocommerce/products/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, findOrCreateWpCategoryByPath } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import type { ProductVariation, WooCommerceImage } from '@/lib/types';


// Schema for updating a product
const productUpdateSchema = z.object({
    id: z.number().optional(), // Added ID for edit mode context
    name: z.string().min(1, 'Name cannot be empty.').optional(),
    sku: z.string().optional(),
    supplier: z.string().optional().nullable(),
    newSupplier: z.string().optional(),
    type: z.enum(['simple', 'variable', 'grouped', 'external']).optional(),
    regular_price: z.string().optional(),
    sale_price: z.string().optional(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private']).optional(),
    tags: z.array(z.string()).optional(),
    category_id: z.number().nullable().optional(),
    images: z.array(z.object({
        id: z.union([z.string(), z.number()]).optional(),
        previewUrl: z.string().optional(), // Used to identify existing images
    })).optional(),
    variations: z.array(z.any()).optional(),
    // Inventory and shipping
    manage_stock: z.boolean().optional(),
    stock_quantity: z.union([z.string(), z.number()]).optional(),
    weight: z.string().optional(),
    dimensions: z.object({
        length: z.string().optional(),
        width: z.string().optional(),
        height: z.string().optional(),
    }).optional(),
    shipping_class: z.string().optional(),
});


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
      throw new Error('WooCommerce API is not configured for the active connection.');
    }
    
    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const { data: productData } = await wooApi.get(`products/${productId}`);
    
    if (productData.type === 'variable') {
        const { data: variationsData } = await wooApi.get(`products/${productId}/variations`, { per_page: 100 });
        productData.variations = variationsData;
    }
    
    return NextResponse.json(productData);

  } catch (error: any) {
    console.error(`Error fetching product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch product details.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;

        const { wooApi, wpApi } = await getApiClientsForUser(uid);
        if (!wooApi || !wpApi) { throw new Error('WooCommerce or WordPress API is not configured.'); }

        const productId = Number(params.id);
        if (!productId) { return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 }); }

        const formData = await req.formData();
        const productDataString = formData.get('productData');
        if (typeof productDataString !== 'string') { throw new Error("productData is missing or not a string."); }
        
        const productData = JSON.parse(productDataString);
        
        const validationResult = productUpdateSchema.safeParse(productData);
        if (!validationResult.success) { 
            return NextResponse.json({ error: 'Invalid product data.', details: validationResult.error.flatten() }, { status: 400 }); 
        }
        
        const validatedData = validationResult.data;
        const { variations, supplier, newSupplier, tags, images, ...restOfData } = validatedData;
        const wooPayload: any = { ...restOfData };
        
        // --- Tags and Categories Logic ---
        if (tags !== undefined) {
          wooPayload.tags = tags.map((name: string) => ({ name: name.trim() })).filter(t => t.name);
        }
        
        const { data: originalProduct } = await wooApi.get(`products/${productId}`);
        let finalCategoryIds: { id: number }[] = (originalProduct.categories || []).map((c: any) => ({ id: c.id }));

        if (validatedData.category_id !== undefined) {
            finalCategoryIds = validatedData.category_id ? [{id: validatedData.category_id}] : [];
        }

        const finalSupplierName = newSupplier || supplier;
        if (finalSupplierName !== undefined) {
            const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${finalSupplierName}`, wpApi, 'product_cat');
            if (supplierCatId) {
                // Ensure supplier category is added without duplicating
                if(!finalCategoryIds.some(c => c.id === supplierCatId)) {
                    finalCategoryIds.push({ id: supplierCatId });
                }
            }
            const supplierAttr = { name: 'Proveedor', options: [finalSupplierName], visible: true, variation: false };
            const existingAttributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
            wooPayload.attributes = [...existingAttributes, supplierAttr];
        } else {
             wooPayload.attributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
        }
        wooPayload.categories = finalCategoryIds;
        
        // --- Stock Logic ---
        if (wooPayload.manage_stock === false) {
            wooPayload.stock_quantity = null;
        } else if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
            const stock = parseInt(String(wooPayload.stock_quantity), 10);
            wooPayload.stock_quantity = isNaN(stock) ? null : stock;
        } else if (wooPayload.manage_stock === true) {
            wooPayload.stock_quantity = null;
        }
        
        // --- Main Product Data Update (excluding images) ---
        const response = await wooApi.put(`products/${productId}`, wooPayload);
        
        // --- New Image Handling via Custom Plugin Endpoint ---
        if (images !== undefined) {
            const newImageFiles = formData.getAll('photos') as File[];
            const imageUrlsToKeep = images.filter(p => !p.id?.toString().startsWith('blob-')).map(p => p.previewUrl);
            
            const uploadedUrls = [];
            for (const file of newImageFiles) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', file);
                 const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/upload-to-storage`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadFormData
                });
                if (!uploadResponse.ok) throw new Error(`Failed to upload ${file.name} to temporary storage`);
                const { url } = await uploadResponse.json();
                uploadedUrls.push(url);
            }
            
            const finalImageUrls = [...(imageUrlsToKeep || []), ...uploadedUrls];
            const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
            
            await wpApi.post(`${siteUrl}/wp-json/custom-api/v1/update-product-images`, {
                product_id: productId,
                mode: 'replace',
                images: finalImageUrls,
            });
        }
        

        // --- Variations Update ---
        if (variations && variations.length > 0) {
            const batchPayload = {
                update: variations.map((v: ProductVariation) => ({
                    id: v.variation_id, regular_price: v.regularPrice || undefined, sale_price: v.salePrice || undefined, sku: v.sku || undefined,
                    manage_stock: v.manage_stock, stock_quantity: v.manage_stock ? (parseInt(v.stockQuantity, 10) || null) : undefined,
                    weight: v.weight || undefined, dimensions: v.dimensions, shipping_class: v.shipping_class || undefined,
                    image: v.image?.id ? { id: v.image.id } : null
                }))
            };
            await wooApi.post(`products/${productId}/variations/batch`, batchPayload);
        }

        return NextResponse.json({ success: true, data: response.data });
    } catch (error: any) {
        console.error(`[AUDIT] Critical error updating product ${params.id}:`, error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'Failed to update product.';
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ error: errorMessage, details: error.response?.data }, { status });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }

    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const response = await wooApi.delete(`products/${productId}`, { force: true });

    return NextResponse.json({ success: true, data: response.data });

  } catch (error: any) {
    console.error(`Error deleting product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to delete product.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
