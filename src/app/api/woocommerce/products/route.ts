
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, findOrCreateCategoryByPath } from '@/lib/api-helpers';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import FormData from 'form-data';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

// Helper function to compute the Cartesian product of arrays
function cartesian(...args: string[][]): string[][] {
    const r: string[][] = [];
    const max = args.length - 1;
    function helper(arr: string[], i: number) {
        for (let j = 0, l = args[i].length; j < l; j++) {
            const a = [...arr, args[i][j]];
            if (i === max) {
                r.push(a);
            } else {
                helper(a, i + 1);
            }
        }
    }
    helper([], 0);
    return r;
}

export async function POST(request: NextRequest) {
  let uid, token;
  try {
    // 1. Authenticate the user and get API clients
    token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication token not provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
    
    const { wooApi, wpApi } = await getApiClientsForUser(uid);
    const productData: ProductData = await request.json();
    
    // 2. Upload images to WordPress via its REST API
    const wordpressImageIds = [];
    for (const [index, photo] of productData.photos.entries()) {
      if (!photo.uploadedUrl) continue;

      try {
        const imageResponse = await axios.get(photo.uploadedUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        // Generate a new SEO-friendly filename, ignoring the original.
        const baseNameForSeo = productData.imageTitle || productData.name || 'product-image';
        const filenameSuffix = productData.photos.length > 1 ? `-${index + 1}` : '';
        const seoFilename = `${slugify(baseNameForSeo)}${filenameSuffix}.jpg`;

        const formData = new FormData();
        formData.append('file', imageBuffer, seoFilename);
        formData.append('title', productData.imageTitle || productData.name);
        formData.append('alt_text', productData.imageAltText || productData.name);
        formData.append('caption', productData.imageCaption || '');
        formData.append('description', productData.imageDescription || '');

        const mediaResponse = await wpApi.post('/media', formData, {
          headers: {
            ...formData.getHeaders(),
            'Content-Disposition': `attachment; filename=${seoFilename}`,
          },
        });

        wordpressImageIds.push({ id: mediaResponse.data.id });

      } catch (uploadError: any) {
        let errorMsg = `Error al procesar la imagen '${photo.name}'.`;
        if (uploadError.response?.data?.message) {
            errorMsg += ` Razón: ${uploadError.response.data.message}`;
            if (uploadError.response.status === 401 || uploadError.response.status === 403) {
              errorMsg += ' Esto es probablemente un problema de permisos. Asegúrate de que el usuario de la Contraseña de Aplicación tiene el rol de "Editor" o "Administrador" en WordPress.';
            }
        } else {
            errorMsg += ` Razón: ${uploadError.message}`;
        }
        console.error(errorMsg, uploadError.response?.data);
        throw new Error(errorMsg);
      }
    }
    
    // Handle category
    let finalCategoryId: number | null = null;
    if (productData.categoryPath) {
        finalCategoryId = await findOrCreateCategoryByPath(productData.categoryPath, wooApi);
    } else if (productData.category) {
        finalCategoryId = productData.category.id;
    }


    // 3. Prepare product data for WooCommerce
    const wooAttributes = productData.attributes
      .filter(attr => attr.name && attr.value)
      .map((attr, index) => ({
        name: attr.name,
        position: index,
        visible: attr.visible !== false, // Use the value from data, default to true
        variation: productData.productType === 'variable' && !!attr.forVariations,
        options: productData.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      }));
    
    const wooTags = productData.keywords ? productData.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];
    
    const formattedProduct: any = {
      name: productData.name,
      sku: productData.sku || undefined,
      type: productData.productType,
      description: productData.longDescription,
      short_description: productData.shortDescription,
      categories: finalCategoryId ? [{ id: finalCategoryId }] : [],
      images: wordpressImageIds,
      attributes: wooAttributes,
      tags: wooTags,
      ...(productData.productType === 'grouped' && { grouped_products: productData.groupedProductIds || [] }),
    };

    // Only add pricing for non-grouped, non-variable products
    if (productData.productType === 'simple') {
        formattedProduct.regular_price = productData.regularPrice;
        formattedProduct.sale_price = productData.salePrice || undefined;
    }


    // 4. Send data to WooCommerce to create the product
    const response = await wooApi.post('products', formattedProduct);
    const createdProduct = response.data;
    const productId = createdProduct.id;

    // 5. If it's a variable product, create the variations.
    if (productData.productType === 'variable') {
        let batchCreatePayload: any[] = [];

        // Case 1: Variations are pre-generated (e.g., from the wizard)
        if (productData.variations && productData.variations.length > 0) {
            batchCreatePayload = productData.variations.map(v => ({
                regular_price: v.regularPrice || undefined,
                sale_price: v.salePrice || undefined,
                sku: v.sku || undefined,
                attributes: v.attributes.map(a => ({
                    name: a.name,
                    option: a.value,
                })),
            }));
        } 
        // Case 2: Variations need to be generated from attributes (e.g., from batch process)
        else {
            const variationAttributes = productData.attributes.filter(
                attr => attr.forVariations && attr.name && attr.value
            );

            if (variationAttributes.length > 0) {
                const attributeNames = variationAttributes.map(attr => attr.name);
                const attributeValueSets = variationAttributes.map(attr =>
                    attr.value.split('|').map(v => v.trim()).filter(Boolean)
                );
                
                if (attributeValueSets.every(set => set.length > 0)) {
                    const combinations = cartesian(...attributeValueSets);
                    batchCreatePayload = combinations.map(combo => ({
                        attributes: combo.map((value, index) => ({
                            name: attributeNames[index],
                            option: value,
                        })),
                    }));
                }
            }
        }
        
        if (batchCreatePayload.length > 0) {
            try {
                await wooApi.post(`products/${productId}/variations/batch`, { create: batchCreatePayload });
            } catch (variationError: any) {
                const errorMessage = variationError.response?.data?.message || variationError.message || 'Error desconocido al crear variaciones.';
                throw new Error(`Producto principal creado (ID: ${productId}), pero falló la creación de variaciones: ${errorMessage}`);
            }
        }
    }


    // 6. Fire-and-forget deletion of temp images from quefoto.es
    for (const photo of productData.photos) {
      if (photo.uploadedFilename) {
        const origin = request.nextUrl.origin;
        axios.post(`${origin}/api/delete-image`, { filename: photo.uploadedFilename }, {
          headers: { 'Authorization': `Bearer ${token}` }
        }).catch(deleteError => {
          console.warn(`Failed to delete temporary image ${photo.uploadedFilename}. Manual cleanup may be required.`, deleteError);
        });
      }
    }
    
    return NextResponse.json({ success: true, data: createdProduct }, { status: response.status });

  } catch (error: any) {
    console.error('Error creating product in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    const userFriendlyError = `Error al crear el producto. Razón: ${errorMessage}`;
    return NextResponse.json({ success: false, error: userFriendlyError, details: error.response?.data }, { status: errorStatus });
  }
}
