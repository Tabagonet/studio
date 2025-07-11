import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ success: false, error: 'Authentication token not provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }

    const { searchParams } = new URL(request.url);
    const sku = searchParams.get('sku');
    const name = searchParams.get('name');

    if (!sku && !name) {
      return NextResponse.json({ error: 'SKU or name parameter is required.' }, { status: 400 });
    }

    if (sku) {
      const response = await wooApi.get('products', { sku: sku.trim() });
      if (response.data.length > 0) {
        return NextResponse.json({ exists: true, message: `El SKU "${sku}" ya existe.` });
      }
    }

    if (name) {
      const response = await wooApi.get('products', { search: name.trim() });
      const exactMatch = response.data.find((product: any) => product.name.toLowerCase() === name.toLowerCase());
      if (exactMatch) {
        return NextResponse.json({ exists: true, message: `Un producto con el nombre "${name}" ya existe.` });
      }
    }

    return NextResponse.json({ exists: false });

  } catch (error: any) {
    console.error('Error checking product existence:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred while checking the product.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    const details = error.response?.data?.data;
    
    return NextResponse.json({ error: errorMessage, details }, { status });
  }
}
