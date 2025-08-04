

// src/app/api/woocommerce/products/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateWpCategoryByPath, findOrCreateTags } from '@/lib/api-helpers';
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
        
        const formData = await request.formData();
        const productDataString = formData.get('productData');
        if (typeof productDataString !== 'string') {
            throw new Error("productData is missing or not a string.");
        }
        
        const finalProductData: ProductData = JSON.parse(productDataString);
        console.log('[API Products] Request body parsed. Data to process:', JSON.stringify(finalProductData, null, 2));

        // 1. Handle category
        let finalCategoryId: number | null = null;
        if (finalProductData.categoryPath) {
            console.log(`[API Products] CategoryPath provided: "${finalProductData.categoryPath}". Finding or creating...`);
            finalCategoryId = await findOrCreateWpCategoryByPath(finalProductData.categoryPath, wpApi);
        } else if (finalProductData.category?.id) {
            console.log(`[API Products] Category ID provided: ${finalProductData.category.id}. Using existing.`);
            finalCategoryId = finalProductData.category.id;
        }
        console.log(`[API Products] Final Category ID: ${finalCategoryId}`);

        // 2. Upload and process images
        const wordpressImageIds = [];
        const photoFiles = formData.getAll('photos');

        for (const [index, photoFile] of photoFiles.entries()) {
            if (photoFile instanceof File) {
                 console.log(`[API Products] Uploading new image: ${photoFile.name}`);
                 const newImageId = await uploadImageToWordPress(
                    photoFile,
                    `${slugify(finalProductData.name)}-${index + 1}.webp`,
                    { title: finalProductData.imageTitle || finalProductData.name, alt_text: finalProductData.imageAltText || finalProductData.name, caption: finalProductData.imageCaption || '', description: finalProductData.imageDescription || '' },
                    wpApi
                );
                wordpressImageIds.push({ id: newImageId });
                console.log(`[API Products] Image uploaded with new ID: ${newImageId}`);
            }
        }
        console.log(`[API Products] Final image ID list:`, wordpressImageIds);

        // 3. Prepare product data - Corrected Attribute Logic
        const wooAttributes = finalProductData.attributes
            .filter(attr => attr.name && attr.name.trim() !== '')
            .map((attr, index) => ({
                name: attr.name,
                position: index,
                visible: attr.visible !== false,
                variation: finalProductData.productType === 'variable' && !!attr.forVariations,
                options: attr.value.split('|').map(s => s.trim()),
            }));
        console.log(`[API Products] Processed attributes:`, JSON.stringify(wooAttributes, null, 2));
        
        // Correct Tag Handling
        const tagNames = typeof finalProductData.tags === 'string' 
            ? finalProductData.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];
        const wooTags = tagNames.map(name => ({ name }));
        console.log(`[API Products] Final tags payload:`, wooTags);


        const wooPayload: any = {
            name: finalProductData.name, type: finalProductData.productType,
            description: finalProductData.longDescription, short_description: finalProductData.shortDescription,
            categories: finalCategoryId ? [{ id: finalCategoryId }] : [],
            images: wordpressImageIds, attributes: wooAttributes,
            tags: wooTags, // Use the processed tags
            lang: finalProductData.language === 'Spanish' ? 'es' : 'en', // Default to es
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
        if (adminDb && admin.firestore.FieldValue) { 
            await adminDb.collection('activity_logs').add({
                userId: uid, action: 'PRODUCT_CREATED', timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: { productId, productName: createdProduct.name, connectionKey: activeConnectionKey, source: finalProductData.source || 'unknown' }
            });
             console.log('[API Products] Activity logged.');
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
