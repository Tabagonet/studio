// src/app/api/woocommerce/products/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags, findOrCreateWpCategoryByPath } from '@/lib/api-helpers';
import type { ProductData, ProductVariation, ProductPhoto } from '@/lib/types';
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
    let authToken: string;
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        authToken = token;
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) { throw new Error('WordPress API is not configured.'); }

        const body = await request.json();
        
        const finalProductData: ProductData = body.productData;
        const lang: string = body.lang;

        // 1. Upload images to WordPress and get their new media IDs
        const uploadedImageIds: { [key: string]: number } = {};
        if (finalProductData.photos && finalProductData.photos.length > 0) {
            for (const photo of finalProductData.photos) {
                if (photo.serverFilePath) { // Use the server path if available
                    const seoFilename = `${slugify(photo.name)}.webp`;
                    
                    const newImageId = await uploadImageToWordPress(
                        photo.serverFilePath, // Pass the physical file path
                        seoFilename,
                        {
                            title: finalProductData.imageTitle || photo.name,
                            alt_text: finalProductData.imageAltText || photo.name,
                            caption: finalProductData.imageCaption || '',
                            description: finalProductData.imageDescription || '',
                        },
                        wpApi
                    );
                    uploadedImageIds[photo.id] = newImageId;
                }
            }
        }

        // 2. Prepare image data for WooCommerce payload
        const wordpressImageIds = finalProductData.photos
            .map(photo => {
                const mediaId = uploadedImageIds[photo.id] || photo.uploadedId;
                return mediaId ? { id: mediaId } : null;
            })
            .filter((img): img is { id: number } => img !== null);
        
        // 3. Handle categories
        let finalCategoryIds: { id: number }[] = [];
        if (finalProductData.category?.id) {
            finalCategoryIds.push({ id: finalProductData.category.id });
        }
        if (finalProductData.categoryPath) {
            const newCatId = await findOrCreateWpCategoryByPath(finalProductData.categoryPath, wpApi, 'product_cat');
            if (newCatId) finalCategoryIds.push({ id: newCatId });
        }
        
        const supplierToAdd = finalProductData.supplier || finalProductData.newSupplier;
        if (supplierToAdd) {
            const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${supplierToAdd}`, wpApi, 'product_cat');
            if (supplierCatId) finalCategoryIds.push({ id: supplierCatId });
        }

        // 4. Prepare attributes
        const wooAttributes = finalProductData.attributes
            .filter(attr => attr.name && attr.name.trim() !== '')
            .map((attr, index) => ({
                name: attr.name,
                position: index,
                visible: attr.visible !== false,
                variation: finalProductData.productType === 'variable' && !!attr.forVariations,
                options: attr.value.split('|').map(s => s.trim()),
            }));
        
        if (supplierToAdd) {
            wooAttributes.push({
                name: 'Proveedor', position: wooAttributes.length,
                visible: true, variation: false, options: [supplierToAdd],
            });
        }
        
        const tagNames = finalProductData.tags ? (typeof finalProductData.tags === 'string' ? finalProductData.tags.split(',') : finalProductData.tags).map(t => t.trim()).filter(Boolean) : [];
        const wooTags = await findOrCreateTags(tagNames, wpApi);

        let finalSku = finalProductData.sku;
        if(finalProductData.sku && supplierToAdd) {
            finalSku = `${finalProductData.sku}-${slugify(supplierToAdd)}`;
        }


        const wooPayload: any = {
            name: finalProductData.name,
            slug: supplierToAdd ? slugify(`${finalProductData.name}-${supplierToAdd}`) : undefined,
            type: finalProductData.productType,
            description: finalProductData.longDescription,
            short_description: finalProductData.shortDescription,
            categories: finalCategoryIds,
            images: wordpressImageIds,
            attributes: wooAttributes,
            tags: wooTags.map(tagId => ({ id: tagId })),
            lang: lang,
            weight: finalProductData.weight || undefined,
            dimensions: finalProductData.dimensions,
            shipping_class: finalProductData.shipping_class || undefined,
            manage_stock: finalProductData.manage_stock,
        };
        
        if (finalProductData.shouldSaveSku !== false) {
             wooPayload.sku = finalSku;
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

        // 5. Create the product
        const { wooApi } = await getApiClientsForUser(uid);
        if (!wooApi) throw new Error("WooCommerce API client could not be created.");
        const response = await wooApi.post('products', wooPayload);
        const createdProduct = response.data;
        const productId = createdProduct.id;

        // 6. Create variations if applicable
        if (finalProductData.productType === 'variable' && finalProductData.variations && finalProductData.variations.length > 0) {
            const batchCreatePayload = finalProductData.variations.map(v => {
                const variationPayload: any = {
                    regular_price: v.regularPrice || undefined, 
                    sale_price: v.salePrice || undefined,
                    attributes: v.attributes.map(a => ({ name: a.name, option: a.option })),
                    weight: v.weight || undefined,
                    dimensions: v.dimensions,
                    shipping_class: v.shipping_class || undefined,
                    manage_stock: v.manage_stock,
                };
                if(finalProductData.shouldSaveSku !== false && v.sku) {
                    let finalVariationSku = v.sku;
                    if(supplierToAdd) {
                        finalVariationSku = `${v.sku}-${slugify(supplierToAdd)}`;
                    }
                    variationPayload.sku = finalVariationSku;
                }
                if (v.manage_stock && v.stockQuantity) {
                    variationPayload.stock_quantity = parseInt(v.stockQuantity, 10);
                }
                return variationPayload;
            });
            const batchResponse = await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
            
            const createdVariations = batchResponse.data.create;
            const variationImageUpdates = [];

            for (let i = 0; i < finalProductData.variations.length; i++) {
                const clientVar = finalProductData.variations[i];
                const serverVar = createdVariations[i]; 

                if (serverVar && clientVar.image?.id) {
                     const imageId = uploadedImageIds[clientVar.image.id];
                     if (imageId) {
                         variationImageUpdates.push({
                             variation_id: serverVar.id,
                             image_id: imageId,
                         });
                     }
                }
            }

            if (variationImageUpdates.length > 0) {
                 const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
                 const updateImageEndpoint = `${siteUrl}/wp-json/custom/v1/update-variation-images`;
                 await wpApi.post(updateImageEndpoint, { variation_images: variationImageUpdates });
            }
        }

        // 7. Log the activity
        if (adminDb && admin.firestore.FieldValue) { 
            const { settings } = await getApiClientsForUser(uid);
            await adminDb.collection('activity_logs').add({
                userId: uid,
                action: 'PRODUCT_CREATED',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: {
                    productId,
                    productName: createdProduct.name,
                    connectionKey: settings?.activeConnectionKey,
                    source: finalProductData.source || 'unknown'
                }
            });
        }
        
        const { settings } = await getApiClientsForUser(uid);
        const storeUrl = settings?.connections?.[settings?.activeConnectionKey as string]?.wooCommerceStoreUrl || '';
        const cleanStoreUrl = storeUrl.endsWith('/') ? storeUrl.slice(0, -1) : storeUrl;
        
        return NextResponse.json({
            success: true,
            data: {
                id: productId,
                title: createdProduct.name,
                url: `${cleanStoreUrl}/wp-admin/post.php?post=${productId}&action=edit`,
            }
        });

    } catch (error: any) {
        console.error('Critical Error in POST /api/woocommerce/products:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unknown error occurred.';
        return NextResponse.json({ error: `Fallo en la creación del producto: ${errorMessage}` }, { status: 500 });
    }
}
