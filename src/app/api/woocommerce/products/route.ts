

import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags, findOrCreateWpCategoryByPath } from '@/lib/api-helpers';
import type { ProductData, ProductVariation } from '@/lib/types';
import axios from 'axios';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};


export async function POST(request: NextRequest) {
    let uid: string;
    try {
        console.log('[API Products] Received POST request.');
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        console.log(`[API Products] User authenticated: ${uid}`);
        
        const { wooApi, wpApi, activeConnectionKey } = await getApiClientsForUser(uid);
        if (!wooApi || !wpApi) { throw new Error('Both WooCommerce and WordPress APIs must be configured.'); }
        console.log('[API Products] API clients obtained.');
        
        const { productData, lang } = await request.json();
        const finalProductData: ProductData = productData;
        console.log('[API Products] Request body parsed. Data to process:', JSON.stringify(finalProductData, null, 2));


        // 1. Handle category using the new custom endpoint
        let finalCategoryId: number | null = null;
        if (finalProductData.categoryPath) {
            console.log(`[API Products] CategoryPath provided: "${finalProductData.categoryPath}". Finding or creating via custom endpoint...`);
            const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
            const categoryEndpoint = `${siteUrl}/wp-json/custom/v1/get-or-create-category`;
            const categoryResponse = await wpApi.post(categoryEndpoint, {
                path: finalProductData.categoryPath,
                lang: lang,
            });
            if (categoryResponse.data.success) {
                 finalCategoryId = categoryResponse.data.term_id;
            } else {
                throw new Error(categoryResponse.data.message || 'Failed to get or create category via custom endpoint.');
            }
        } else if (finalProductData.category?.id) {
            console.log(`[API Products] Category ID provided: ${finalProductData.category.id}. Using existing.`);
            finalCategoryId = finalProductData.category.id;
        }
        console.log(`[API Products] Final Category ID: ${finalCategoryId}`);


        // 2. Upload and process images (if they have an uploadedUrl from the temp server)
        const wordpressImageIds = [];
        for (const [index, photo] of finalProductData.photos.entries()) {
            if (photo.uploadedUrl) {
                console.log(`[API Products] Uploading new image: ${photo.name}`);
                const newImageId = await uploadImageToWordPress(
                    photo.uploadedUrl,
                    `${slugify(finalProductData.name)}-${index + 1}.jpg`,
                    { title: finalProductData.imageTitle || finalProductData.name, alt_text: finalProductData.imageAltText || finalProductData.name, caption: finalProductData.imageCaption || '', description: finalProductData.imageDescription || '' },
                    wpApi
                );
                wordpressImageIds.push({ id: newImageId });
                console.log(`[API Products] Image uploaded with new ID: ${newImageId}`);
            } else if (photo.id && typeof photo.id === 'number') {
                wordpressImageIds.push({ id: photo.id });
            }
        }
        console.log(`[API Products] Final image ID list:`, wordpressImageIds);

        // 3. Prepare product data - Corrected Attribute Logic
        const wooAttributes = finalProductData.attributes
            .filter(attr => attr.name && attr.name.trim() !== '') // Only filter by name
            .map((attr, index) => ({
                name: attr.name,
                position: index,
                visible: attr.visible !== false,
                variation: finalProductData.productType === 'variable' && !!attr.forVariations,
                options: attr.value.split('|').map(s => s.trim()),
            }));
        console.log(`[API Products] Processed attributes:`, JSON.stringify(wooAttributes, null, 2));

        const tagNames = finalProductData.tags ? finalProductData.tags.split(',').map(tag => tag.trim()).filter(Boolean) : [];
        const tagIds = await findOrCreateTags(tagNames, wpApi);
        console.log('[API Products] Final tag IDs:', tagIds);


        const wooPayload: any = {
            name: finalProductData.name, type: finalProductData.productType,
            description: finalProductData.longDescription, short_description: finalProductData.shortDescription,
            categories: finalCategoryId ? [{ id: finalCategoryId }] : [],
            images: wordpressImageIds, attributes: wooAttributes,
            tags: tagIds.map(id => ({ id })),
            lang: lang,
            weight: finalProductData.weight || undefined,
            dimensions: finalProductData.dimensions,
            shipping_class: finalProductData.shipping_class || undefined,
            manage_stock: finalProductData.manage_stock,
        };
        
        if (finalProductData.shouldSaveSku !== false) {
             wooPayload.sku = finalProductData.sku;
        }


        if (finalProductData.productType === 'simple') {
            wooPayload.regular_price = finalProductData.regularPrice;
            wooPayload.sale_price = finalProductData.salePrice || undefined;
            if (finalProductData.manage_stock && finalProductData.stockQuantity) {
                wooPayload.stock_quantity = parseInt(finalProductData.stockQuantity, 10);
            }
        } else if (finalProductData.productType === 'grouped') {
            wooPayload.grouped_products = finalProductData.groupedProductIds || [];
        }

        // 4. Create the product
        console.log('[API Products] Final WooCommerce Payload:', JSON.stringify(wooPayload, null, 2));
        const response = await wooApi.post('products', wooPayload);
        const createdProduct = response.data;
        const productId = createdProduct.id;
        console.log(`[API Products] Product created successfully with ID: ${productId}`);

        // 5. Create variations if applicable
        if (finalProductData.productType === 'variable' && finalProductData.variations && finalProductData.variations.length > 0) {
            console.log(`[API Products] Creating ${finalProductData.variations.length} variations...`);
            const batchCreatePayload = finalProductData.variations.map(v => {
                const variationPayload: any = {
                    regular_price: v.regularPrice || undefined, 
                    sale_price: v.salePrice || undefined,
                    attributes: v.attributes.map(a => ({ name: a.name, option: a.value })),
                    weight: v.weight || undefined,
                    dimensions: v.dimensions,
                    shipping_class: v.shipping_class || undefined,
                    manage_stock: v.manage_stock,
                };
                if(finalProductData.shouldSaveSku !== false && v.sku) {
                    variationPayload.sku = v.sku;
                }
                if (v.manage_stock && v.stockQuantity) {
                    variationPayload.stock_quantity = parseInt(v.stockQuantity, 10);
                }
                return variationPayload;
            });
            await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
            console.log('[API Products] Variations created.');
        }

        // 6. Log the activity
        if (adminDb && admin.firestore.FieldValue && lang === 'es') { 
            await adminDb.collection('activity_logs').add({
                userId: uid, action: 'PRODUCT_CREATED', timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: { productId, productName: createdProduct.name, connectionKey: activeConnectionKey, source: finalProductData.source || 'unknown' }
            });
             console.log('[API Products] Activity logged.');
        }
        
        // 7. Fire-and-forget deletion of temp images
        for (const photo of finalProductData.photos) {
            if (photo.uploadedFilename) {
                axios.post(`${request.nextUrl.origin}/api/delete-image`, { filename: photo.uploadedFilename }, { headers: { 'Authorization': `Bearer ${token}` }})
                     .then(() => console.log(`[API Products] Deleted temp image: ${photo.uploadedFilename}`))
                     .catch(deleteError => console.warn(`[API Products] Failed to delete temp image ${photo.uploadedFilename}.`, deleteError));
            }
        }
        
        const storeUrl = wooApi.url.endsWith('/') ? wooApi.url.slice(0, -1) : wooApi.url;
        
        return NextResponse.json({
            success: true,
            data: {
                id: productId,
                title: createdProduct.name,
                url: `${storeUrl}/wp-admin/post.php?post=${productId}&action=edit`,
            }
        });

    } catch (error: any) {
        console.error('Critical Error in POST /api/woocommerce/products:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unknown error occurred.';
        return NextResponse.json({ error: `Fallo en la creación del producto: ${errorMessage}` }, { status: 500 });
    }
}
