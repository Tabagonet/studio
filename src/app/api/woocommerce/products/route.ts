
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

// Helper to format data for WooCommerce API
// This version uses external URLs for images, which is simpler and more robust.
const formatProductForWooCommerce = (data: ProductData) => {
  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value)
    .map((attr, index) => ({
      name: attr.name,
      position: index,
      visible: true,
      variation: data.productType === 'variable',
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
    }));
  
  const wooTags = data.keywords ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];
  
  // Sort photos to ensure the primary one is first
  const sortedPhotos = [...data.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

  // Create image objects with URLs. This tells WooCommerce to download the image.
  const wooImages = sortedPhotos.map((photo, index) => {
      const seoFilename = `${slugify(data.imageTitle || data.name)}-${index}`;
      return {
          src: photo.uploadedUrl,
          name: seoFilename, // Use AI-generated title for the filename
          alt: data.imageAltText || data.name, // Use AI-generated alt text
      };
  });

  return {
    name: data.name,
    sku: data.sku || undefined,
    type: data.productType,
    regular_price: data.regularPrice,
    sale_price: data.salePrice || undefined,
    description: data.longDescription,
    short_description: data.shortDescription,
    categories: data.category ? [{ id: data.category.id }] : [],
    images: wooImages, // Pass the array of image objects with external URLs
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
    // 3. Format product data directly with the external URLs from quefoto.es
    const formattedProduct = formatProductForWooCommerce(productData);

    // 4. Send data to WooCommerce to create the product
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
