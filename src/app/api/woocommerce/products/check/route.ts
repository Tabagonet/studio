
// src/app/api/woocommerce/products/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { adminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }
    
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get('sku');
    const name = searchParams.get('name');

    if (!sku && !name) {
        return NextResponse.json({ error: 'SKU or name parameter is required.' }, { status: 400 });
    }

    let response;
    let existingProduct = null;
    let productType = 'desconocido';
    let field = sku ? 'sku' : 'name';
    let value = sku || name;

    if (sku) {
        response = await wooApi.get('products', { sku: sku });
        if (response.data && response.data.length > 0) {
            existingProduct = response.data[0];
            productType = existingProduct.type;
        }
    } else if (name) {
        response = await wooApi.get('products', { search: name, search_columns: ['post_title'] });
        if (response.data && response.data.length > 0) {
            existingProduct = response.data.find((p: any) => p.name.toLowerCase() === name.toLowerCase());
            if (existingProduct) {
              productType = existingProduct.type;
            }
        }
    }

    if (existingProduct) {
        const message = field === 'sku' 
            ? `Ya existe un producto de tipo '${productType}' con el SKU ${value}.`
            : `Ya existe un producto de tipo '${productType}' con el nombre "${value}".`;

        return NextResponse.json({ 
            exists: true, 
            message: message,
            product: {
                id: existingProduct.id,
                name: existingProduct.name,
                type: productType,
                permalink: existingProduct.permalink,
            }
        });
    }
        
    return NextResponse.json({ 
        exists: false,
        message: `El ${field.toUpperCase()} está disponible.` // Ensure a message is always sent.
    });

  } catch (error: any) {
    console.error('Error checking product existence:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to check product existence.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage },
      { status }
    );
  }
}
