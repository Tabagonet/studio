
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import FormData from 'form-data';

// Helper to create a URL-friendly slug
const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w-]+/g, '')     // Remove all non-word chars
        .replace(/--+/g, '-')        // Replace multiple - with single -
        .replace(/^-+/, '')          // Trim - from start of text
        .replace(/-+$/, '');         // Trim - from end of text
};

/**
 * Uploads an image from a URL to the WordPress media library and sets its metadata.
 * @param imageUrl The URL of the image to upload (from quefoto.es)
 * @param productData The product data containing AI-generated metadata.
 * @param originalPhotoName The original filename of the photo.
 * @returns The ID of the newly created media item in WordPress.
 */
async function uploadImageToWordPress(imageUrl: string, productData: ProductData, originalPhotoName: string): Promise<number> {
    const { WOOCOMMERCE_STORE_URL, WOOCOMMERCE_API_KEY, WOOCOMMERCE_API_SECRET } = process.env;

    // 1. Download the image from the temporary URL
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);
    const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';
    const seoFilename = `${slugify(productData.name || 'product')}-${Date.now()}.${mimeType.split('/')[1] || 'jpg'}`;

    // 2. Prepare form data for WordPress REST API
    const formData = new FormData();
    formData.append('file', imageBuffer, seoFilename);
    // Use AI-generated content for metadata
    formData.append('title', productData.imageTitle || productData.name);
    formData.append('alt_text', productData.imageAltText || productData.name);
    formData.append('caption', productData.imageCaption || productData.shortDescription);
    formData.append('description', productData.imageDescription || productData.longDescription);
    
    // 3. Authenticate and POST to WordPress Media endpoint
    const wpApiUrl = `${WOOCOMMERCE_STORE_URL}/wp-json/wp/v2/media`;
    const basicAuth = Buffer.from(`${WOOCOMMERCE_API_KEY}:${WOOCOMMERCE_API_SECRET}`).toString('base64');

    const wpResponse = await axios.post(wpApiUrl, formData, {
        headers: {
            ...formData.getHeaders(),
            'Authorization': `Basic ${basicAuth}`,
            'Content-Disposition': `attachment; filename="${seoFilename}"`,
        }
    });

    if (wpResponse.status !== 201 || !wpResponse.data.id) {
        throw new Error(`Failed to upload image ${originalPhotoName} to WordPress.`);
    }

    // 4. Return the new Media ID
    return wpResponse.data.id;
}


// Helper to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData, imageIds: {id: number}[]) => {
  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value)
    .map(attr => ({
      name: attr.name,
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      variation: data.productType === 'variable'
    }));
  
  const wooTags = data.keywords ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];
  
  return {
    name: data.name,
    sku: data.sku || undefined,
    type: data.productType,
    regular_price: data.regularPrice,
    sale_price: data.salePrice || undefined,
    description: data.longDescription,
    short_description: data.shortDescription,
    categories: data.category ? [{ id: data.category.id }] : [],
    images: imageIds, // Use the new image IDs from WordPress Media Library
    attributes: wooAttributes,
    tags: wooTags,
  };
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

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  
  try {
    // 3. Upload images to WordPress and get their IDs
    const imageIds: { id: number }[] = [];
    // Sort photos to ensure the primary one is first
    const sortedPhotos = [...productData.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));
    
    for (const photo of sortedPhotos) {
        if (photo.uploadedUrl) {
           try {
               const mediaId = await uploadImageToWordPress(photo.uploadedUrl, productData, photo.name);
               imageIds.push({ id: mediaId });
           } catch(e: any) {
               console.error(`Error processing image ${photo.name}:`, e.response?.data || e.message);
               // Handle specific WordPress permission error
               if (e.response?.data?.code === 'rest_cannot_create') {
                   throw new Error(`Error al procesar la imagen '${photo.name}'. Razón: ${e.response.data.message} Revisa los permisos del usuario de la API Key en WordPress. Debe tener rol de 'Editor' o 'Administrador'.`);
               }
               throw new Error(`Error al procesar la imagen '${photo.name}'. Razón: ${e.message}`);
           }
        }
    }

    // 4. Send data to WooCommerce to create the product
    const formattedProduct = formatProductForWooCommerce(productData, imageIds);
    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      // 5. Fire-and-forget deletion of temp images from quefoto.es AFTER successful creation
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
