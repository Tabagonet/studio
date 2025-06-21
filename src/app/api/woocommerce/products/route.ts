
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData, ProductPhoto } from '@/lib/types';

// Helper function to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData) => {
  const primaryPhoto = data.photos.find(p => p.isPrimary) || data.photos[0];
  const galleryPhotos = data.photos.filter(p => p.id !== primaryPhoto?.id);

  const wooImages = [];
  if (primaryPhoto?.url) {
    wooImages.push({ src: primaryPhoto.url, position: 0 });
  }
  galleryPhotos.forEach((photo, index) => {
    if (photo.url) {
      wooImages.push({ src: photo.url, position: index + 1 });
    }
  });

  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value) // Ensure attribute has name and value
    .map(attr => ({
      name: attr.name,
      // For variable products, options should be an array of strings.
      // For simple products, it's a single string in the `options` array.
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      // This is crucial for variable products.
      variation: data.productType === 'variable'
    }));

  const wooProduct = {
    name: data.name,
    sku: data.sku || undefined, // Send undefined if empty to let WC handle it
    type: data.productType,
    regular_price: data.regularPrice,
    sale_price: data.salePrice || undefined,
    description: data.longDescription,
    short_description: data.shortDescription,
    categories: data.category ? [{ slug: data.category }] : [],
    images: wooImages,
    attributes: wooAttributes,
    // You could also add tags from keywords here
    // tags: data.keywords.split(',').map(k => ({ name: k.trim() })),
  };

  return wooProduct;
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
    console.error("Error verifying Firebase token in /api/woocommerce/products:", error);
    return NextResponse.json({ success: false, error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  try {
    // 3. Get and format product data
    const productData: ProductData = await request.json();
    const formattedProduct = formatProductForWooCommerce(productData);

    // 4. Send data to WooCommerce
    const response = await wooApi.post('products', formattedProduct);

    // 5. Handle WooCommerce response
    if (response.status >= 200 && response.status < 300) {
      return NextResponse.json({ success: true, data: response.data }, { status: response.status });
    } else {
      // This case might not be hit if wooApi throws on non-2xx statuses, but it's good practice
      return NextResponse.json({ success: false, error: 'Received a non-successful status from WooCommerce.', details: response.data }, { status: response.status });
    }

  } catch (error: any) {
    // 6. Handle any errors during the process
    console.error('Error creating product in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    return NextResponse.json({ success: false, error: errorMessage, details: error.response?.data }, { status: errorStatus });
  }
}
