
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

// Helper to create a URL-friendly slug
const slugify = (text: string) => {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

// Helper to remove HTML tags for plain text contexts
const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, '');

// Helper to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData, imageObjects: { id: number, position: number }[]) => {
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
    images: imageObjects,
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

  // 2. Validate WooCommerce API client and credentials
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }
  const wooUrl = process.env.WOOCOMMERCE_STORE_URL;
  const consumerKey = process.env.WOOCOMMERCE_API_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_API_SECRET;

  if (!wooUrl || !consumerKey || !consumerSecret) {
    return NextResponse.json({ success: false, error: 'WooCommerce API credentials are not fully configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  const uploadedImageObjects: { id: number, position: number }[] = [];
  
  // 3. Process URLs from quefoto.es: download image, then upload to WordPress media library
  if (productData.photos && productData.photos.length > 0) {
    const sortedPhotos = [...productData.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

    for (const [index, photo] of sortedPhotos.entries()) {
      if (!photo.uploadedUrl) continue;

      try {
        // Download image from the temporary URL
        const imageResponse = await axios.get(photo.uploadedUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        
        const mimeType = imageResponse.headers['content-type'] || 'image/jpeg';
        const extension = mimeType.split('/')[1] || 'jpg';
        const seoFilename = `${slugify(productData.name || 'product')}-${uuidv4()}.${extension}`;
        
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: seoFilename, contentType: mimeType });
        
        // Append metadata directly to the WordPress media upload
        formData.append('title', productData.name || 'Product Image');
        formData.append('alt_text', productData.name || 'Product Image');
        if (productData.shortDescription) formData.append('caption', stripHtml(productData.shortDescription));
        if (productData.longDescription) formData.append('description', stripHtml(productData.longDescription));

        const mediaUploadUrl = `${wooUrl}/wp-json/wp/v2/media`;

        const uploadResponse = await axios.post(mediaUploadUrl, formData, {
            headers: {
              ...formData.getHeaders(),
              'Authorization': `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64')}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });

        if (uploadResponse.data && uploadResponse.data.id) {
            uploadedImageObjects.push({ id: uploadResponse.data.id, position: index });
        } else {
            throw new Error('Image upload to WordPress media library succeeded but returned no ID.');
        }

      } catch (imageError: any) {
        console.error(`Error processing URL ${photo.uploadedUrl}:`, imageError.response?.data || imageError.message);
        const wpError = imageError.response?.data;
        const userFriendlyError = `Error al procesar la imagen '${photo.name}'. Razón: ${wpError?.message || imageError.message}`;
        return NextResponse.json({ success: false, error: userFriendlyError }, { status: imageError.response?.status || 500 });
      }
    }
  }
  
  // 4. Send data to WooCommerce
  try {
    const formattedProduct = formatProductForWooCommerce(productData, uploadedImageObjects);
    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      // 5. Fire-and-forget deletion of temp images from quefoto.es AFTER successful creation
      for (const photo of productData.photos) {
        if (photo.uploadedFilename) {
          axios.post("https://quefoto.es/borrarfoto.php", new URLSearchParams({ filename: photo.uploadedFilename }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 15000,
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
    const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    return NextResponse.json({ success: false, error: errorMessage, details: error.response?.data }, { status: errorStatus });
  }
}
