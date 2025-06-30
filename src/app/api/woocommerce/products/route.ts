
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, findOrCreateCategoryByPath, uploadImageToWordPress, findOrCreateTags } from '@/lib/api-helpers';
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
    let uid, token;
    try {
        token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wooApi, wpApi, activeConnectionKey } = await getApiClientsForUser(uid);
        if (!wooApi || !wpApi) { throw new Error('Both WooCommerce and WordPress APIs must be configured.'); }
        
        const { productData, lang } = await request.json();
        const finalProductData: ProductData = productData;

        // 1. Handle category
        const finalCategoryId = await findOrCreateCategoryByPath(finalProductData.categoryPath || finalProductData.category?.name || '', wooApi);

        // 2. Upload images (if they have an uploadedUrl from the temp server)
        const wordpressImageIds = [];
        for (const [index, photo] of finalProductData.photos.entries()) {
            if (photo.uploadedUrl) {
                const newImageId = await uploadImageToWordPress(
                    photo.uploadedUrl,
                    `${slugify(finalProductData.name)}-${index + 1}.jpg`,
                    { title: finalProductData.imageTitle || finalProductData.name, alt_text: finalProductData.imageAltText || finalProductData.name, caption: finalProductData.imageCaption || '', description: finalProductData.imageDescription || '' },
                    wpApi
                );
                wordpressImageIds.push({ id: newImageId });
            } else if (photo.id && typeof photo.id === 'number') {
                wordpressImageIds.push({ id: photo.id });
            }
        }

        // 3. Prepare common product data
        const wooAttributes = finalProductData.attributes
            .filter(attr => attr.name && attr.value)
            .map((attr, index) => ({
                name: attr.name, position: index, visible: attr.visible !== false, variation: finalProductData.productType === 'variable' && !!attr.forVariations,
                options: finalProductData.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
            }));
        const wooTags = finalProductData.keywords ? await findOrCreateTags(finalProductData.keywords.split(',').map(k => k.trim()).filter(Boolean), wpApi) : [];

        const wooPayload: any = {
            name: finalProductData.name, type: finalProductData.productType,
            ...(finalProductData.shouldSaveSku !== false && finalProductData.sku && { sku: finalProductData.sku }),
            description: finalProductData.longDescription, short_description: finalProductData.shortDescription,
            categories: finalCategoryId ? [{ id: finalCategoryId }] : [],
            images: wordpressImageIds, attributes: wooAttributes,
            tags: wooTags.map(id => ({ id })),
            lang: lang,
            weight: finalProductData.weight || undefined,
            dimensions: finalProductData.dimensions,
            shipping_class: finalProductData.shipping_class || undefined,
            manage_stock: finalProductData.manage_stock,
        };

        if (finalProductData.productType === 'simple') {
            wooPayload.regular_price = finalProductData.regularPrice;
            wooPayload.sale_price = finalProductData.salePrice || undefined;
            if (finalProductData.manage_stock) {
                wooPayload.stock_quantity = parseInt(finalProductData.stockQuantity, 10);
            }
        } else if (finalProductData.productType === 'grouped') {
            wooPayload.grouped_products = finalProductData.groupedProductIds || [];
        }

        // 4. Create the product
        const response = await wooApi.post('products', wooPayload);
        const createdProduct = response.data;
        const productId = createdProduct.id;

        // 5. Create variations if applicable
        if (finalProductData.productType === 'variable' && finalProductData.variations && finalProductData.variations.length > 0) {
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
                if (v.manage_stock) {
                    variationPayload.stock_quantity = parseInt(v.stockQuantity, 10);
                }
                return variationPayload;
            });
            await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
        }

        // 6. Log the activity
        if (adminDb && admin.firestore.FieldValue && lang === 'es') { // Only log the original creation
            await adminDb.collection('activity_logs').add({
                userId: uid, action: 'PRODUCT_CREATED', timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: { productId, productName: createdProduct.name, connectionKey: activeConnectionKey, source: finalProductData.source || 'unknown' }
            });
        }
        
        // 7. Fire-and-forget deletion of temp images
        for (const photo of finalProductData.photos) {
            if (photo.uploadedFilename) {
                axios.post(`${request.nextUrl.origin}/api/delete-image`, { filename: photo.uploadedFilename }, { headers: { 'Authorization': `Bearer ${token}` }})
                     .catch(deleteError => console.warn(`Failed to delete temp image ${photo.uploadedFilename}.`, deleteError));
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
