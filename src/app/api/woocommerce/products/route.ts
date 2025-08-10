
// src/app/api/woocommerce/products/route.ts

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
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wpApi, wooApi } = await getApiClientsForUser(uid);
        if (!wpApi || !wooApi) { throw new Error('WordPress or WooCommerce API is not configured.'); }

        const formData = await request.formData();
        const productDataString = formData.get('productData') as string | null;
        if (!productDataString) {
            throw new Error("productData is missing from the form data.");
        }

        const finalProductData: ProductData = JSON.parse(productDataString);
        const lang: string = finalProductData.language === 'Spanish' ? 'es' : 'en';

        // 1. Upload ALL images (both featured and variation potentials)
        const uploadedPhotosMap = new Map<string, number>();
        for (const [key, value] of formData.entries()) {
            if (key === 'productData' || !(value instanceof File)) {
                continue;
            }
            const file = value;
            const clientSideId = key; // This is the unique ID from the frontend
            
            const newImageId = await uploadImageToWordPress(
                file,
                `${slugify(finalProductData.name)}-${clientSideId}.webp`,
                { title: finalProductData.imageTitle || finalProductData.name, alt_text: finalProductData.imageAltText || finalProductData.name, caption: finalProductData.imageCaption || '', description: finalProductData.imageDescription || '' },
                wpApi
            );
            uploadedPhotosMap.set(clientSideId, newImageId);
        }
        
        // Prepare the `images` array for the main product payload
        const wooImagesPayload = finalProductData.photos
            .filter(photo => !photo.toDelete)
            .map(photo => {
                if (uploadedPhotosMap.has(String(photo.id))) {
                    return { id: uploadedPhotosMap.get(String(photo.id)) };
                }
                if (typeof photo.id === 'number') {
                    return { id: photo.id };
                }
                return null;
        }).filter(p => p !== null);
        
        // 2. Prepare categories and tags
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

        const tagNames = Array.isArray(finalProductData.tags) ? finalProductData.tags : [];
        const wooTags = await findOrCreateTags(tagNames, wpApi);

        // 3. Prepare attributes
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
        
        let finalSku = finalProductData.sku;
        if(finalProductData.sku && supplierToAdd) {
            finalSku = `${finalProductData.sku}-${slugify(supplierToAdd)}`;
        }

        // 4. Construct main product payload
        const wooPayload: any = {
            name: finalProductData.name,
            slug: supplierToAdd ? slugify(`${finalProductData.name}-${supplierToAdd}`) : undefined,
            type: finalProductData.productType,
            description: finalProductData.longDescription,
            short_description: finalProductData.shortDescription,
            categories: finalCategoryIds,
            images: wooImagesPayload,
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

        // 5. Create main product
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

                if (v.image && v.image.id) {
                    const clientId = v.image.id.toString();
                    const wpId = uploadedPhotosMap.get(clientId) || (typeof v.image.id === 'number' ? v.image.id : null);
                    if (wpId) {
                        variationPayload.image = { id: wpId };
                    }
                }
                return variationPayload;
            });
            await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
        }


        // 7. Log activity
        if (adminDb && admin.firestore.FieldValue) {
            const { settings } = await getApiClientsForUser(uid);
            const activeConnectionKey = settings?.activeConnectionKey || 'default';
            await adminDb.collection('activity_logs').add({
                userId: uid,
                action: 'PRODUCT_CREATED',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: {
                    productId,
                    productName: createdProduct.name,
                    connectionKey: activeConnectionKey,
                    source: finalProductData.source || 'unknown'
                }
            });
        }
        
        const storeUrl = (await getApiClientsForUser(uid)).settings?.connections?.[(await getApiClientsForUser(uid)).activeConnectionKey as string]?.wooCommerceStoreUrl || '';
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
