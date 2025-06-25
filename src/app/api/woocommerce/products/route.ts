
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, findOrCreateCategoryByPath, uploadImageToWordPress, findOrCreateTags, translateContent } from '@/lib/api-helpers';
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

const cartesian = (...args: string[][]): string[][] => {
    const r: string[][] = [];
    const max = args.length - 1;
    function helper(arr: string[], i: number) {
        for (let j = 0, l = args[i].length; j < l; j++) {
            const a = [...arr, args[i][j]];
            if (i === max) r.push(a);
            else helper(a, i + 1);
        }
    }
    helper([], 0);
    return r;
};

async function createProductInWoo(productData: ProductData, wooApi: any, wpApi: any, finalCategoryId: number | null): Promise<any> {
    const wordpressImageIds = [];
    for (const [index, photo] of productData.photos.entries()) {
        if (photo.uploadedUrl) {
            const newImageId = await uploadImageToWordPress(
                photo.uploadedUrl,
                `${slugify(productData.name)}-${index + 1}.jpg`,
                { title: productData.imageTitle || productData.name, alt_text: productData.imageAltText || productData.name, caption: productData.imageCaption || '', description: productData.imageDescription || '' },
                wpApi
            );
            wordpressImageIds.push({ id: newImageId });
        } else if (photo.id && typeof photo.id === 'number') {
            wordpressImageIds.push({ id: photo.id });
        }
    }

    const wooAttributes = productData.attributes
        .filter(attr => attr.name && attr.value)
        .map((attr, index) => ({
            name: attr.name, position: index, visible: attr.visible !== false, variation: productData.productType === 'variable' && !!attr.forVariations,
            options: productData.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
        }));

    const wooTags = productData.keywords ? await findOrCreateTags(productData.keywords.split(',').map(k => k.trim()).filter(Boolean), wpApi) : [];

    const formattedProduct: any = {
        name: productData.name, type: productData.productType,
        ...(productData.shouldSaveSku !== false && productData.sku && { sku: productData.sku }),
        description: productData.longDescription, short_description: productData.shortDescription,
        categories: finalCategoryId ? [{ id: finalCategoryId }] : [],
        images: wordpressImageIds, attributes: wooAttributes,
        tags: wooTags.map(id => ({ id })),
        ...(productData.productType === 'grouped' && { grouped_products: productData.groupedProductIds || [] }),
    };

    if (productData.productType === 'simple') {
        formattedProduct.regular_price = productData.regularPrice;
        formattedProduct.sale_price = productData.salePrice || undefined;
    }
    
    const response = await wooApi.post('products', formattedProduct);
    const createdProduct = response.data;
    const productId = createdProduct.id;

    if (productData.productType === 'variable') {
        const variations = productData.variations && productData.variations.length > 0
            ? productData.variations
            : (() => {
                const variationAttributes = productData.attributes.filter(attr => attr.forVariations && attr.name && attr.value);
                if (variationAttributes.length === 0) return [];
                const attributeNames = variationAttributes.map(attr => attr.name);
                const attributeValueSets = variationAttributes.map(attr => attr.value.split('|').map(v => v.trim()).filter(Boolean));
                if (attributeValueSets.some(set => set.length === 0)) return [];
                return cartesian(...attributeValueSets).map((combo): Omit<ProductVariation, 'id'> => ({
                    attributes: combo.map((value, index) => ({ name: attributeNames[index], value })),
                    sku: `${productData.sku || 'SKU'}-${combo.map(v => v.substring(0,3).toUpperCase()).join('-')}`,
                    regularPrice: '', salePrice: '',
                }));
            })();

        if (variations.length > 0) {
            const batchCreatePayload = variations.map(v => ({
                regular_price: v.regularPrice || undefined, sale_price: v.salePrice || undefined,
                ...(productData.shouldSaveSku !== false && v.sku && { sku: v.sku }),
                attributes: v.attributes.map(a => ({ name: a.name, option: a.value })),
            }));
            await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
        }
    }
    return createdProduct;
}


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
        
        const originalProductData: ProductData = await request.json();

        // 1. Handle category for original and all translations
        const finalCategoryId = await findOrCreateCategoryByPath(originalProductData.categoryPath || originalProductData.category?.name || '', wooApi);

        // 2. Create the original product
        const createdProduct = await createProductInWoo(originalProductData, wooApi, wpApi, finalCategoryId);
        
        const storeUrl = wooApi.url.endsWith('/') ? wooApi.url.slice(0, -1) : wooApi.url;
        const allCreatedLinks = [{
            url: `${storeUrl}/wp-admin/post.php?post=${createdProduct.id}&action=edit`,
            title: createdProduct.name,
        }];
        
        const sourceLangSlug = (ALL_LANGUAGES.find(l => l.code === originalProductData.language)?.slug || 'es');
        const allTranslations: { [key: string]: number } = { [sourceLangSlug]: createdProduct.id };

        // 3. Handle translations if any
        if (originalProductData.targetLanguages && originalProductData.targetLanguages.length > 0) {
            for (const lang of originalProductData.targetLanguages) {
                const { title: translatedName, content: translatedShortDesc } = await translateContent({ title: originalProductData.name, content: originalProductData.shortDescription }, lang);
                const { content: translatedLongDesc } = await translateContent({ title: '', content: originalProductData.longDescription }, lang);
                
                const translatedData: ProductData = {
                    ...originalProductData,
                    name: translatedName,
                    shortDescription: translatedShortDesc,
                    longDescription: translatedLongDesc,
                };
                
                const translatedProduct = await createProductInWoo(translatedData, wooApi, wpApi, finalCategoryId);
                
                allCreatedLinks.push({
                    url: `${storeUrl}/wp-admin/post.php?post=${translatedProduct.id}&action=edit`,
                    title: translatedProduct.name,
                });
                
                const targetLangSlug = ALL_LANGUAGES.find(l => l.code === lang)?.slug || lang.toLowerCase().substring(0, 2);
                allTranslations[targetLangSlug] = translatedProduct.id;
            }
        }
        
        // 4. Link all translations together
        if (Object.keys(allTranslations).length > 1) {
            const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
            if(siteUrl) {
                await wpApi.post(`${siteUrl}/wp-json/custom/v1/link-translations`, { translations: allTranslations });
            }
        }

        // 5. Log the activity
        if (adminDb && admin.firestore.FieldValue) {
            await adminDb.collection('activity_logs').add({
                userId: uid, action: 'PRODUCT_CREATED', timestamp: admin.firestore.FieldValue.serverTimestamp(),
                details: { productId: createdProduct.id, productName: createdProduct.name, connectionKey: activeConnectionKey, source: originalProductData.source || 'unknown', translationCount: allCreatedLinks.length - 1 }
            });
        }
        
        // 6. Fire-and-forget deletion of temp images from quefoto.es
        for (const photo of originalProductData.photos) {
            if (photo.uploadedFilename) {
                axios.post(`${request.nextUrl.origin}/api/delete-image`, { filename: photo.uploadedFilename }, { headers: { 'Authorization': `Bearer ${token}` }})
                     .catch(deleteError => console.warn(`Failed to delete temp image ${photo.uploadedFilename}.`, deleteError));
            }
        }

        return NextResponse.json({ success: true, data: allCreatedLinks });

    } catch (error: any) {
        console.error('Critical Error in POST /api/woocommerce/products:', error.response?.data || error);
        const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred.';
        return NextResponse.json({ error: `Fallo en la creación del producto: ${errorMessage}` }, { status: 500 });
    }
}
