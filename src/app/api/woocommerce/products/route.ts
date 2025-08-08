
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
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wooApi, wpApi, activeConnectionKey } = await getApiClientsForUser(uid);
        if (!wooApi || !wpApi) { throw new Error('Both WooCommerce and WordPress APIs must be configured.'); }
        
        const formData = await request.formData();
        const productDataString = formData.get('productData');
        if (typeof productDataString !== 'string') {
            throw new Error("productData is missing or not a string.");
        }
        
        const finalProductData: ProductData = JSON.parse(productDataString);

        // 1. Handle category
        let finalCategoryIds: { id: number }[] = [];
        if (finalProductData.category?.id) {
            finalCategoryIds.push({ id: finalProductData.category.id });
        }
        if (finalProductData.categoryPath) {
            const newCatId = await findOrCreateWpCategoryByPath(finalProductData.categoryPath, wpApi, 'product_cat');
            if (newCatId) finalCategoryIds.push({ id: newCatId });
        }
        
        // Handle supplier category
        const supplierToAdd = finalProductData.supplier;
        if (supplierToAdd) {
            const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${supplierToAdd}`, wpApi, 'product_cat');
            if (supplierCatId) finalCategoryIds.push({ id: supplierCatId });
        }

        // 2. Upload and process images
        const wordpressImageIds = [];
        const photoFiles = formData.getAll('photos');

        for (const [index, photoFile] of photoFiles.entries()) {
            if (photoFile instanceof File) {
                 const newImageId = await uploadImageToWordPress(
                    photoFile,
                    `${slugify(finalProductData.name)}-${index + 1}.webp`,
                    { title: finalProductData.imageTitle || finalProductData.name, alt_text: finalProductData.imageAltText || finalProductData.name, caption: finalProductData.imageCaption || '', description: finalProductData.imageDescription || '' },
                    wpApi
                );
                wordpressImageIds.push({ id: newImageId });
            }
        }

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
        
        // Add supplier attribute
        if (supplierToAdd) {
            wooAttributes.push({
                name: 'Proveedor',
                position: wooAttributes.length,
                visible: true,
                variation: false,
                options: [supplierToAdd],
            });
        }
        
        // Correct Tag Handling from string to array of objects
        const tagNames = finalProductData.tags ? finalProductData.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
        const wooTags = tagNames.map((name: string) => ({ name }));

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
            tags: wooTags,
            lang: finalProductData.language === 'Spanish' ? 'es' : 'en', // Default to es
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
            await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
        }

        // 6. Log the activity
        if (adminDb && admin.firestore.FieldValue) { 
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
