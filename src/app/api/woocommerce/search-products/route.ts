
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ProductSearchResult } from '@/lib/types';
import { adminAuth } from '@/lib/firebase-admin';

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
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const include = searchParams.get('include');
    const page = searchParams.get('page') || '1';
    const category = searchParams.get('category');
    const type = searchParams.get('type'); // 'simple', 'variable', 'all', etc.

    const params: any = {
      per_page: 20,
      page: parseInt(page, 10),
      orderby: 'date',
      order: 'desc',
    };

    if (include) {
      params.include = include.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
    } else {
      if (query) {
        params.search = query;
      }
      if (type && type !== 'all') {
        params.type = type;
      }
       if (category && category !== 'all') {
        params.category = category;
      }
      // If 'type' is 'all' or not provided, we don't add the type param, so WC returns all types.
    }

    const response = await wooApi.get("products", params);
    
    const products: ProductSearchResult[] = response.data.map((product: any) => ({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images.length > 0 ? product.images[0].src : null,
        sku: product.sku,
        type: product.type,
        status: product.status,
        stock_status: product.stock_status,
        categories: product.categories.map((c: any) => ({ id: c.id, name: c.name })),
    }));

    const totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages'], 10) : 1;
        
    return NextResponse.json({ products, totalPages });
  } catch (error: any) {
    console.error('Error searching WooCommerce products:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to search products.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
