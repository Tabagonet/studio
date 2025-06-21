
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData } from '@/lib/types';
import axios from 'axios';

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

// Helper to remove HTML tags for plain text contexts
const stripHtml = (html: string) => html ? html.replace(/<[^>]*>?/gm, '') : '';

// Helper to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData) => {
  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value)
    .map(attr => ({
      name: attr.name,
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      variation: data.productType === 'variable'
    }));
  
  const wooTags = data.keywords ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];

  // Sort photos to ensure the primary one is first
  const sortedPhotos = [...data.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

  // CRUCIAL: Pass the image URLs directly. WooCommerce will download them.
  const imageObjects = sortedPhotos
    .filter(photo => photo.uploadedUrl) // Ensure we only process photos that were successfully uploaded
    .map((photo, index) => ({
      src: photo.uploadedUrl,
      position: index,
      alt: stripHtml(data.shortDescription || data.name || 'Product Image'),
      name: slugify(data.name || 'product-image') + `-${index}`,
  }));

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

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  
  // 3. Send data to WooCommerce
  try {
    const formattedProduct = formatProductForWooCommerce(productData);
    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      // 4. Fire-and-forget deletion of temp images from quefoto.es AFTER successful creation
      for (const photo of productData.photos) {
        if (photo.uploadedFilename) {
          // Use a simple fetch for the background task to avoid extra dependencies
          fetch("https://quefoto.es/borrarfoto.php", {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ filename: photo.uploadedFilename })
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
    const userFriendlyError = `Error al crear el producto. Razón: ${errorMessage}`;
    return NextResponse.json({ success: false, error: userFriendlyError, details: error.response?.data }, { status: errorStatus });
  }
}
