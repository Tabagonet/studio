
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
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w-]+/g, '')       // Remove all non-word chars
        .replace(/--+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

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
    images: imageObjects, // Use the array of {id, position} objects
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
  
  // 3. Process and upload images directly to WordPress
  if (productData.photos && productData.photos.length > 0) {
    const sortedPhotos = [...productData.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

    for (const [index, photo] of sortedPhotos.entries()) {
      if (!photo.dataUri) continue;

      try {
        const base64EncodedImageString = photo.dataUri.split(',')[1];
        if (!base64EncodedImageString) throw new Error('Invalid data URI provided.');

        const imageBuffer = Buffer.from(base64EncodedImageString, 'base64');
        
        const mimeType = photo.dataUri.split(';')[0].split(':')[1] || 'image/jpeg';
        const extension = mimeType.split('/')[1] || 'jpg';
        
        const seoFilename = `${slugify(productData.name || 'product')}-${uuidv4()}.${extension}`;
        
        const formData = new FormData();
        formData.append('file', imageBuffer, { filename: seoFilename, contentType: mimeType });
        
        // Append metadata directly to the upload
        formData.append('title', productData.name || 'Product Image');
        formData.append('alt_text', productData.name || 'Product Image');
        if (productData.shortDescription) formData.append('caption', productData.shortDescription);
        if (productData.longDescription) formData.append('description', productData.longDescription);

        const mediaUploadUrl = `${wooUrl}/wp-json/wp/v2/media`;

        const uploadResponse = await axios.post(mediaUploadUrl, formData, {
            headers: {
              ...formData.getHeaders(),
              // Use Basic Auth for the WordPress Media API endpoint
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
        console.error(`Error processing and uploading image ${photo.name} to WordPress:`, imageError.response?.data || imageError.message);
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
