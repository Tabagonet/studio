
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';

export async function GET(request: NextRequest) {
  // 1. Authenticate the user
  const token = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ success: false, error: 'Authentication token not provided.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error verifying Firebase token in /api/woocommerce/products/check:", error);
    return NextResponse.json({ success: false, error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get('sku');
  const name = searchParams.get('name');

  if (!sku && !name) {
    return NextResponse.json({ error: 'SKU or name parameter is required.' }, { status: 400 });
  }

  try {
    if (sku) {
      const response = await wooApi.get('products', { sku: sku.trim() });
      if (response.data.length > 0) {
        return NextResponse.json({ exists: true, message: `El SKU "${sku}" ya existe.` });
      }
    }

    if (name) {
      // WooCommerce search can be broad. We fetch results and check for an exact name match.
      const response = await wooApi.get('products', { search: name.trim() });
      const exactMatch = response.data.find((product: any) => product.name.toLowerCase() === name.toLowerCase());
      if (exactMatch) {
        return NextResponse.json({ exists: true, message: `Un producto con el nombre "${name}" ya existe.` });
      }
    }

    return NextResponse.json({ exists: false });

  } catch (error: any) {
    console.error('Error checking product existence in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'An unknown error occurred while checking the product.';
    const details = error.response?.data?.data; // Specific details if available
    return NextResponse.json({ error: errorMessage, details }, { status: error.response?.status || 500 });
  }
}
