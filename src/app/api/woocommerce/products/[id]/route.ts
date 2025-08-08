// src/app/api/woocommerce/products/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, findOrCreateWpCategoryByPath, uploadImageToWordPress } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import type { ProductVariation, WooCommerceImage } from '@/lib/types';


const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};


// Schema for updating a product
const productUpdateSchema = z.object({
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
        id: z.union([z.string(), z.number()]).optional(), // Allow both string (for new images) and number (for existing)
    })).optional(),
    variations: z.array(z.any()).optional(),
    // Metadata for any new images being uploaded
    imageTitle: z.string().optional(),
    imageAltText: z.string().optional(),
    imageCaption: z.string().optional(),
    imageDescription: z.string().optional(),
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
    console.log('[AUDIT - PUT /products/:id] API endpoint hit.');
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        console.log(`[AUDIT - PUT /products/:id] User authenticated: ${uid}`);
        console.log(`[AUDIT - PUT /products/:id] Content-Type Header: ${req.headers.get('Content-Type')}`);


        const { wooApi, wpApi } = await getApiClientsForUser(uid);
        if (!wooApi) { throw new Error('WooCommerce API is not configured for the active connection.'); }

        const productId = params.id;
        if (!productId) { return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 }); }

        console.log(`[AUDIT - PUT /products/:id] Processing update for product ID: ${productId}`);

        const formData = await req.formData();
        const productDataString = formData.get('productData');
        if (typeof productDataString !== 'string') { throw new Error("productData is missing or not a string."); }
        
        console.log('[AUDIT - PUT /products/:id] Received productData string.');
        const productData = JSON.parse(productDataString);
        const photoFiles = formData.getAll('photos') as File[];
        
        console.log(`[AUDIT - PUT /products/:id] Parsed productData. Found ${photoFiles.length} new image files.`);


        const validationResult = productUpdateSchema.safeParse(productData);
        if (!validationResult.success) { 
            console.error('[AUDIT - PUT /products/:id] Zod validation failed:', validationResult.error.flatten());
            return NextResponse.json({ error: 'Invalid product data.', details: validationResult.error.flatten() }, { status: 400 }); 
        }
        
        const validatedData = validationResult.data;
        const { imageTitle, imageAltText, imageCaption, imageDescription, variations, supplier, newSupplier, ...restOfData } = validatedData;
        const wooPayload: any = { ...restOfData };
        
        const { data: originalProduct } = await wooApi.get(`products/${productId}`);
        console.log(`[AUDIT - PUT /products/:id] Fetched original product data.`);


        if (validatedData.tags !== undefined) {
          wooPayload.tags = validatedData.tags.map((name: string) => ({ name }));
        }
        
        const currentCategoryIds = originalProduct.categories.map((c: any) => c.id);
        let finalCategoryIds = validatedData.category_id ? [{ id: validatedData.category_id }] : [];
        
        const finalSupplierName = newSupplier || supplier;
        if (finalSupplierName !== undefined) {
            console.log(`[AUDIT - PUT /products/:id] Handling supplier: ${finalSupplierName}`);
            const originalSupplierAttr = originalProduct.attributes.find((a: any) => a.name === 'Proveedor');
            const originalSupplierName = originalSupplierAttr ? originalSupplierAttr.options[0] : null;

            if (originalSupplierName && originalSupplierName !== finalSupplierName) {
                const allCategories = (await wooApi.get('products/categories', { per_page: 100 })).data;
                const oldSupplierCategory = allCategories.find((c: any) => c.name === originalSupplierName);
                if (oldSupplierCategory) {
                    finalCategoryIds = currentCategoryIds.filter((id: number) => id !== oldSupplierCategory.id);
                }
            }
            
            if (finalSupplierName) {
                if (!wpApi) { throw new Error('La API de WordPress debe estar configurada para gestionar proveedores como categorías.'); }
                const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${finalSupplierName}`, wpApi, 'product_cat');
                if (supplierCatId && !finalCategoryIds.some(c => c.id === supplierCatId)) {
                    finalCategoryIds.push({ id: supplierCatId });
                }
                
                const supplierAttr = { name: 'Proveedor', options: [finalSupplierName], visible: true, variation: false };
                const existingAttributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
                wooPayload.attributes = [...existingAttributes, supplierAttr];
                wooPayload.slug = slugify(`${validatedData.name || originalProduct.name}-${finalSupplierName}`);
            } else if (originalSupplierName) {
                wooPayload.attributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
                wooPayload.slug = slugify(validatedData.name || originalProduct.name);
            }
        }
        
        wooPayload.categories = finalCategoryIds;

        // Image Handling
        console.log(`[AUDIT - PUT /products/:id] Handling images. Existing images in payload: ${validatedData.images?.length}. New files: ${photoFiles.length}.`);
        if (validatedData.images) {
            if (!wpApi) { throw new Error('WordPress API must be configured to upload new images.'); }
            const existingImageIds = validatedData.images.filter(img => typeof img.id === 'number').map(img => ({ id: img.id }));
            
            console.log(`[AUDIT - PUT /products/:id] Preserving ${existingImageIds.length} existing images.`);

            const newUploadedImageIds = [];
            for (const file of photoFiles) {
                console.log(`[AUDIT - PUT /products/:id] Uploading new file: ${file.name}`);
                const baseNameForSeo = imageTitle || validatedData.name || 'product-image';
                const seoFilename = `${slugify(baseNameForSeo)}-${productId}-${Date.now()}.webp`;

                const newImageId = await uploadImageToWordPress(
                    file, seoFilename, { title: imageTitle || validatedData.name || '', alt_text: imageAltText || validatedData.name || '', caption: imageCaption || '', description: imageDescription || '' }, wpApi
                );
                newUploadedImageIds.push({ id: newImageId });
                console.log(`[AUDIT - PUT /products/:id] New image uploaded with ID: ${newImageId}`);
            }
            wooPayload.images = [...existingImageIds, ...newUploadedImageIds];
        } else {
            console.log('[AUDIT - PUT /products/:id] No "images" key in payload, images will not be modified.');
            delete wooPayload.images;
        }
        
        if (wooPayload.manage_stock === false) {
            wooPayload.stock_quantity = null;
        } else if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
            const stock = parseInt(String(wooPayload.stock_quantity), 10);
            wooPayload.stock_quantity = isNaN(stock) ? null : stock;
        } else if (wooPayload.manage_stock === true) {
            wooPayload.stock_quantity = null;
        }
        
        console.log('[AUDIT - PUT /products/:id] Sending final payload to WooCommerce:', JSON.stringify(wooPayload, null, 2));
        const response = await wooApi.put(`products/${productId}`, wooPayload);
        console.log('[AUDIT - PUT /products/:id] WooCommerce update successful.');

        
        if (variations && variations.length > 0) {
            console.log(`[AUDIT - PUT /products/:id] Updating ${variations.length} variations.`);
            const batchPayload = {
                update: variations.map((v: ProductVariation) => ({
                    id: v.variation_id, regular_price: v.regularPrice || undefined, sale_price: v.salePrice || undefined, sku: v.sku || undefined,
                    manage_stock: v.manage_stock, stock_quantity: v.manage_stock ? (parseInt(v.stockQuantity, 10) || null) : undefined,
                    weight: v.weight || undefined, dimensions: v.dimensions, shipping_class: v.shipping_class || undefined,
                }))
            };
            await wooApi.post(`products/${productId}/variations/batch`, batchPayload);
            console.log('[AUDIT - PUT /products/:id] Variation update successful.');
        }

        return NextResponse.json({ success: true, data: response.data });
    } catch (error: any) {
        console.error(`[AUDIT - ERROR] Error updating product ${params.id}:`, error.response?.data || error.message);
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
