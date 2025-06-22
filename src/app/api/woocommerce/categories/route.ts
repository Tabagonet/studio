
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { WooCommerceCategory } from '@/lib/types';
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

    const response = await wooApi.get("products/categories", { per_page: 100 });
    
    const categories: WooCommerceCategory[] = response.data
        .filter((cat: any) => cat.name !== 'Uncategorized')
        .map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          parent: cat.parent,
        }));
        
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching WooCommerce categories:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch categories.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
