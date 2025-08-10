// src/app/api/woocommerce/products/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, findOrCreateWpCategoryByPath, uploadImageToWordPress, findOrCreateTags } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import type { ProductVariation, WooCommerceImage, ProductAttribute } from '@/lib/types';


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
    categoryPath: z.string().optional(),
    images: z.array(z.object({
        id: z.union([z.string(), z.number()]).optional(),
        isPrimary: z.boolean().optional(),
        toDelete: z.boolean().optional(),
    })).optional(),
    variations: z.array(z.any()).optional(),
    attributes: z.array(z.any()).optional(),
    // Metadata for any new images being uploaded
    imageTitle: z.string().optional(),
    imageAltText: z.string().optional(),
    imageCaption: z.string().optional(),
    imageDescription: z.string().optional(),
    // Inventory and shipping
    manage_stock: z.boolean().optional(),
    stock_quantity: z.string().optional(),
    weight: z.string().optional(),
    dimensions: z.object({
        length: z.string().optional(),
        width: z.string().optional(),
        height: z.string().optional(),
    }).optional(),
    shipping_class: z.string().optional(),
});


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  console.log(`[API EDIT][AUDIT] GET /api/woocommerce/products/[id] - Request received for ID: ${params.id}`);
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
    console.log(`[API EDIT][AUDIT] Fetched raw product data for ${productId}:`, productData.type, productData.attributes);
    
    if (productData.type === 'variable') {
        const { data: variationsData } = await wooApi.get(`products/${productId}/variations`, { per_page: 100 });
        productData.variations = variationsData;
    }
    
    // Transform attributes options array into a pipe-separated string for the UI
    if (productData.attributes && Array.isArray(productData.attributes)) {
      productData.attributes = productData.attributes.map((attr: any) => ({
        ...attr,
        value: (attr.options || []).join(' | '),
      }));
    }
     console.log(`[API EDIT][AUDIT] Processed product data being sent to client:`, {type: productData.type, attributes: productData.attributes});
    
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
    console.log("[API EDIT][AUDIT] PUT /api/woocommerce/products/[id] - Request received.");
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        console.log(`[API EDIT][AUDIT] User authenticated: ${uid}`);

        const { wooApi, wpApi } = await getApiClientsForUser(uid);
        if (!wooApi) { throw new Error('WooCommerce API is not configured for the active connection.'); }
        if (!wpApi) { throw new Error('WordPress API is not configured for the active connection.'); }


        const productId = params.id;
        if (!productId) { return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 }); }

        const formData = await req.formData();
        const productDataString = formData.get('productData') as string | null;
        if (!productDataString) {
            throw new Error("productData is missing from the form data.");
        }
        
        const productData = JSON.parse(productDataString);
        console.log("[API EDIT][AUDIT] Parsed product data from form:", productData);
        
        const validationResult = productUpdateSchema.safeParse(productData);
        if (!validationResult.success) { 
            console.error("[API EDIT][AUDIT] Product data validation failed:", validationResult.error.flatten());
            return NextResponse.json({ error: 'Invalid product data.', details: validationResult.error.flatten() }, { status: 400 }); 
        }
        
        const validatedData = validationResult.data;
        const { imageTitle, imageAltText, imageCaption, imageDescription, variations, supplier, newSupplier, categoryPath, tags, ...restOfData } = validatedData;
        const wooPayload: any = { ...restOfData };
        
        const attributes = Array.isArray(validatedData.attributes) ? validatedData.attributes : [];
        const sortedImages = [...(validatedData.images || [])].sort((a,b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));
        
        // Handle Tags
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const tagIds = await findOrCreateTags(tags, wpApi);
            wooPayload.tags = tagIds.map(tagId => ({ id: tagId }));
        } else {
            wooPayload.tags = [];
        }
        
        wooPayload.attributes = attributes.map((attr: ProductAttribute, index: number) => ({
            id: attr.id || 0,
            name: attr.name,
            position: attr.position || index,
            visible: attr.visible !== false,
            variation: attr.forVariations || attr.variation || false,
            options: (attr.value || '').split('|').map(o => o.trim()).filter(Boolean).map(String),
        }));
        
        // Handle Categories and Suppliers separately
        let productCategoryIds: { id: number }[] = [];
        if (categoryPath) {
             const newCatId = await findOrCreateWpCategoryByPath(categoryPath, wpApi, 'product_cat');
             if (newCatId) productCategoryIds.push({ id: newCatId });
        } else if (validatedData.category_id !== undefined && validatedData.category_id !== null) {
              productCategoryIds.push({id: validatedData.category_id});
        } else {
             const { data: originalProduct } = await wooApi.get(`products/${productId}`);
             const allCategories = (await wooApi.get('products/categories', { per_page: 100 })).data;
             const parentSupplierCategory = allCategories.find((c: any) => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
             const supplierSubCatIds = parentSupplierCategory ? allCategories.filter((c:any) => c.parent === parentSupplierCategory.id).map((c:any) => c.id) : [];
             productCategoryIds = originalProduct.categories?.filter((c: any) => !supplierSubCatIds.includes(c.id)).map((c: any) => ({id: c.id})) || [];
        }
        
        const finalSupplierName = newSupplier || supplier;
        if (finalSupplierName) {
            const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${finalSupplierName}`, wpApi, 'product_cat');
            // We just ensure the supplier category exists, but don't add it to the product's main categories.
            console.log(`[API EDIT][AUDIT] Ensured supplier category exists with ID: ${supplierCatId}`);
        }
        wooPayload.categories = productCategoryIds;
        
        const uploadedPhotosMap = new Map<string, number>();
        const newPhotoFiles = Array.from(formData.entries())
            .filter(([key]) => key !== 'productData')
            .map(([key, value]) => ({ key, file: value as File }));

        if (newPhotoFiles.length > 0) {
            console.log(`[API EDIT][AUDIT] Found ${newPhotoFiles.length} new photo files to upload.`);
            for (const { key: clientSideId, file } of newPhotoFiles) {
                 const baseNameForSeo = imageTitle || validatedData.name || 'product-image';
                 const seoFilename = `${slugify(baseNameForSeo)}-${productId}-${Date.now()}.webp`;
                 console.log(`[API EDIT][AUDIT] Uploading new image with client ID ${clientSideId}`);
                 const newImageId = await uploadImageToWordPress(file, seoFilename, { title: imageTitle || validatedData.name || '', alt_text: imageAltText || validatedData.name || '', caption: imageCaption || '', description: imageDescription || '' }, wpApi);
                 uploadedPhotosMap.set(clientSideId, newImageId);
                 console.log(`[API EDIT][AUDIT] Image ${clientSideId} uploaded. New WordPress Media ID: ${newImageId}`);
            }
        }
        
        const finalImagePayload = sortedImages
            .filter(p => !p.toDelete)
            .map(img => {
                if (typeof img.id === 'string' && uploadedPhotosMap.has(img.id)) {
                    return { id: uploadedPhotosMap.get(img.id) };
                }
                if (typeof img.id === 'number') {
                    return { id: img.id };
                }
                return null;
            }).filter(Boolean);

        wooPayload.images = finalImagePayload;
        console.log("[API EDIT][AUDIT] Final image payload for WooCommerce:", finalImagePayload);
        
        if (wooPayload.manage_stock === false) {
            wooPayload.stock_quantity = null;
        } else if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
            const stock = parseInt(String(wooPayload.stock_quantity), 10);
            wooPayload.stock_quantity = isNaN(stock) ? null : stock;
        } else if (wooPayload.manage_stock === true) {
            wooPayload.stock_quantity = null;
        }
        
        console.log("[API EDIT][AUDIT] Sending final payload to WooCommerce PUT endpoint...", wooPayload);
        const response = await wooApi.put(`products/${productId}`, wooPayload);
        console.log("[API EDIT][AUDIT] Product update successful.");

        const finalVariations = Array.isArray(variations) ? variations : [];
        if (finalVariations.length > 0) {
            console.log("[API EDIT][AUDIT] Processing variation updates...");
            
            const generalPrice = wooPayload.regular_price;
            
            const batchPayload = {
                update: finalVariations.map((v: ProductVariation) => ({
                    id: v.variation_id, 
                    regular_price: (v.regularPrice !== '' ? v.regularPrice : (generalPrice !== '' ? generalPrice : undefined))?.toString(),
                    sale_price: v.salePrice || undefined, 
                    sku: v.sku || undefined,
                    manage_stock: v.manage_stock, 
                    stock_quantity: v.manage_stock ? (parseInt(v.stockQuantity, 10) || null) : undefined,
                    weight: v.weight || undefined, 
                    dimensions: v.dimensions, 
                    shipping_class: v.shipping_class || undefined,
                    image: v.image?.toDelete ? null : (v.image?.id ? { id: v.image.id } : undefined)
                }))
            };
            console.log("[API EDIT][AUDIT] Sending variation batch payload:", batchPayload);
            await wooApi.post(`products/${productId}/variations/batch`, batchPayload);
            console.log("[API EDIT][AUDIT] Variation updates sent.");
        }

        return NextResponse.json({ success: true, data: response.data });
    } catch (error: any) {
        console.error(`[API EDIT][AUDIT] Critical error updating product ${params.id}:`, error.response?.data || error.message, error.stack);
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
