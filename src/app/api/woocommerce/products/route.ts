
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import { wpApi } from '@/lib/wordpress';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import FormData from 'form-data';
import path from 'path';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w-]+/g, '')     // Remove all non-word chars
        .replace(/--+/g, '-')        // Replace multiple - with single -
        .replace(/^-+/, '')          // Trim - from start of text
        .replace(/-+$/, '');         // Trim - from end of text
};

export async function POST(request: NextRequest) {
  // 1. Authenticate the user
  const token = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ success: false, error: 'Authentication token not provided.' }, { status: 401 });
  }
  try {
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    return NextResponse.json({ success: false, error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  // 2. Validate API clients
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }
  if (!wpApi) {
    return NextResponse.json({ success: false, error: 'WordPress API client is not configured. Check WORDPRESS_API_URL, USERNAME, and APPLICATION_PASSWORD in .env' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  
  try {
    // 3. Upload images to WordPress via its REST API
    const wordpressImageIds = [];
    for (const photo of productData.photos) {
      if (!photo.uploadedUrl) continue;

      try {
        const imageResponse = await axios.get(photo.uploadedUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);

        const originalFilename = photo.name || 'image.jpg';
        const seoFilename = `${slugify(productData.name)}-${slugify(path.parse(originalFilename).name)}.jpg`;

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
    
    // 4. Prepare product data for WooCommerce
    const wooAttributes = productData.attributes
      .filter(attr => attr.name && attr.value)
      .map((attr, index) => ({
        name: attr.name,
        position: index,
        visible: true,
        variation: productData.productType === 'variable',
        options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      }));
    
    const wooTags = productData.keywords ? productData.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];
    
    const formattedProduct = {
      name: productData.name,
      sku: productData.sku || undefined,
      type: productData.productType,
      regular_price: productData.regularPrice,
      sale_price: productData.salePrice || undefined,
      description: productData.longDescription,
      short_description: productData.shortDescription,
      categories: productData.category ? [{ id: productData.category.id }] : [],
      images: wordpressImageIds, // Use the IDs from the WordPress media library
      attributes: wooAttributes,
      tags: wooTags,
    };

    // 5. Send data to WooCommerce to create the product
    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      // 6. Fire-and-forget deletion of temp images from quefoto.es AFTER successful creation
      for (const photo of productData.photos) {
        if (photo.uploadedFilename) {
          axios.post(`${request.nextUrl.origin}/api/delete-image`, { filename: photo.uploadedFilename }, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(deleteError => {
            console.warn(`Failed to delete temporary image ${photo.uploadedFilename} from quefoto.es. Manual cleanup may be required.`, deleteError);
          });
        }
      }
      return NextResponse.json({ success: true, data: response.data }, { status: response.status });
    } else {
      return NextResponse.json({ success: false, error: 'Received a non-successful status from WooCommerce.', details: response.data }, { status: response.status });
    }

  } catch (error: any) {
    console.error('Error creating product in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    const userFriendlyError = `Error al crear el producto. Razón: ${errorMessage}`;
    return NextResponse.json({ success: false, error: userFriendlyError, details: error.response?.data }, { status: errorStatus });
  }
}
