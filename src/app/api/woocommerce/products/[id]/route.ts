// src/app/api/woocommerce/products/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, findOrCreateWpCategoryByPath, uploadImageToWordPress } from '@/lib/api-helpers';
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
    images: z.array(z.object({
        id: z.union([z.string(), z.number()]).optional(),
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
    console.log("[AUDIT] PUT /api/woocommerce/products/[id] - Request received.");
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        console.log(`[AUDIT] User authenticated: ${uid}`);

        const { wooApi, wpApi } = await getApiClientsForUser(uid);
        if (!wooApi) { throw new Error('WooCommerce API is not configured for the active connection.'); }

        const productId = params.id;
        if (!productId) { return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 }); }

        const formData = await req.formData();
        const productDataString = formData.get('productData');
        if (typeof productDataString !== 'string') { throw new Error("productData is missing or not a string."); }
        
        const productData = JSON.parse(productDataString);
        console.log("[AUDIT] Parsed product data from form.");
        
        const validationResult = productUpdateSchema.safeParse(productData);
        if (!validationResult.success) { 
            console.error("[AUDIT] Product data validation failed:", validationResult.error.flatten());
            return NextResponse.json({ error: 'Invalid product data.', details: validationResult.error.flatten() }, { status: 400 }); 
        }
        
        const validatedData = validationResult.data;
        const { imageTitle, imageAltText, imageCaption, imageDescription, variations, supplier, newSupplier, tags, ...restOfData } = validatedData;
        const wooPayload: any = { ...restOfData };
        
        const attributes = Array.isArray(validatedData.attributes) ? validatedData.attributes : [];
        const images = Array.isArray(validatedData.images) ? validatedData.images : [];
        
        const { data: originalProduct } = await wooApi.get(`products/${productId}`);
        console.log("[AUDIT] Fetched original product data.");

        if (tags !== undefined) {
          wooPayload.tags = tags.map((name: string) => ({ name: name.trim() })).filter(t => t.name);
        }
        
        wooPayload.attributes = attributes.map((attr: ProductAttribute) => ({
            id: attr.id || 0,
            name: attr.name,
            position: attr.position || 0,
            visible: attr.visible ?? true,
            variation: attr.forVariations || attr.variation || false,
            options: (attr.value || '').split('|').map(o => o.trim()).filter(Boolean).map(String),
        }));

        let finalCategoryIds: { id: number }[] = [];
        if (validatedData.category_id !== undefined) {
          if(validatedData.category_id) {
              finalCategoryIds.push({id: validatedData.category_id});
          }
        } else {
            const productCatIds = originalProduct.categories.map((c: any) => c.id);
            finalCategoryIds = productCatIds.map((id: number) => ({id}));
        }

        const finalSupplierName = newSupplier || supplier;
        if (finalSupplierName !== undefined) {
            const allCategories = (await wooApi.get('products/categories', { per_page: 100 })).data;
            const parentSupplierCategory = allCategories.find((c: any) => c.name.toLowerCase() === 'proveedores' && c.parent === 0);
            
            if (parentSupplierCategory) {
                const supplierSubCats = allCategories.filter((c:any) => c.parent === parentSupplierCategory.id).map((c:any) => c.id);
                finalCategoryIds = finalCategoryIds.filter(c => !supplierSubCats.includes(c.id));
            }
            
            if (finalSupplierName) {
                if (!wpApi) { throw new Error('La API de WordPress debe estar configurada para gestionar proveedores como categorías.'); }
                const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${finalSupplierName}`, wpApi, 'product_cat');
                if (supplierCatId && !finalCategoryIds.some(c => c.id === supplierCatId)) {
                    finalCategoryIds.push({ id: supplierCatId });
                }
            }
        }
        wooPayload.categories = finalCategoryIds;
        
        const newPhotoFiles = Array.from(formData.keys())
            .filter(key => key !== 'productData')
            .map(key => ({ key, file: formData.get(key) as File }));
        
        const uploadedPhotosMap = new Map<string, number>();
        if (newPhotoFiles.length > 0) {
            console.log(`[AUDIT] Found ${newPhotoFiles.length} new photo files to upload.`);
            if (!wpApi) { throw new Error('WordPress API must be configured to upload new images.'); }
            
            for (const { key: clientSideId, file } of newPhotoFiles) {
                 const baseNameForSeo = imageTitle || validatedData.name || 'product-image';
                 const seoFilename = `${slugify(baseNameForSeo)}-${productId}-${Date.now()}.webp`;
                 console.log(`[AUDIT] Uploading new image with client ID ${clientSideId}`);
                 const newImageId = await uploadImageToWordPress(file, seoFilename, { title: imageTitle || validatedData.name || '', alt_text: imageAltText || validatedData.name || '', caption: imageCaption || '', description: imageDescription || '' }, wpApi);
                 uploadedPhotosMap.set(clientSideId, newImageId);
                 console.log(`[AUDIT] Image ${clientSideId} uploaded. New WordPress Media ID: ${newImageId}`);
            }
        }

        // CORRECTED LOGIC
        // 1. Start with existing images that are NOT marked for deletion
        let finalImagePayload = images
            .filter(p => !p.toDelete && typeof p.id === 'number')
            .map(img => ({ id: img.id as number }));

        // 2. Add the newly uploaded images from the map
        for (const [clientId, wpId] of uploadedPhotosMap.entries()) {
            // Ensure we don't add duplicates if it was somehow already there
            if (!finalImagePayload.some(p => p.id === wpId)) {
                finalImagePayload.push({ id: wpId });
            }
        }
        
        wooPayload.images = finalImagePayload;

        // DEBUG LOGS
        console.log("[DEBUG] validatedData.images:", images);
        console.log("[DEBUG] Uploaded photos map keys:", Array.from(uploadedPhotosMap.keys()));
        console.log("[AUDIT] Final image payload for WooCommerce:", finalImagePayload);
        
        if (wooPayload.manage_stock === false) {
            wooPayload.stock_quantity = null;
        } else if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
            const stock = parseInt(String(wooPayload.stock_quantity), 10);
            wooPayload.stock_quantity = isNaN(stock) ? null : stock;
        } else if (wooPayload.manage_stock === true) {
            wooPayload.stock_quantity = null;
        }
        
        console.log("[AUDIT] Sending final payload to WooCommerce PUT endpoint...");
        const response = await wooApi.put(`products/${productId}`, wooPayload);
        console.log("[AUDIT] Product update successful.");

        const finalVariations = Array.isArray(variations) ? variations : [];
        if (finalVariations.length > 0) {
            console.log("[AUDIT] Processing variation updates...");
            const batchPayload = {
                update: finalVariations.map((v: ProductVariation) => ({
                    id: v.variation_id, regular_price: v.regularPrice || undefined, sale_price: v.salePrice || undefined, sku: v.sku || undefined,
                    manage_stock: v.manage_stock, stock_quantity: v.manage_stock ? (parseInt(v.stockQuantity, 10) || null) : undefined,
                    weight: v.weight || undefined, dimensions: v.dimensions, shipping_class: v.shipping_class || undefined,
                    image: v.image?.toDelete ? null : (v.image?.id ? { id: v.image.id } : undefined)
                }))
            };
            await wooApi.post(`products/${productId}/variations/batch`, batchPayload);
            console.log("[AUDIT] Variation updates sent.");
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
