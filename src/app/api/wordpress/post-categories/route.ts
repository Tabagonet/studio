
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { WordPressPostCategory } from '@/lib/types';
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

    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const response = await wpApi.get("categories", { params: { per_page: 100 } });
    
    const categories: WordPressPostCategory[] = response.data
        .filter((cat: any) => cat.name !== 'Uncategorized') // Standard WP default category
        .map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          parent: cat.parent,
          count: cat.count,
        }));
        
    return NextResponse.json(categories);
  } catch (error: any) {
    console.error('Error fetching WordPress post categories:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch categories.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
