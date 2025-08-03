import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;

    const { wpApi, wooApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
      throw new Error('WordPress API is not configured for the active connection.');
    }

    const getCount = async (api: any, endpoint: string, params: any = {}): Promise<number> => {
      if (!api) return 0;
      try {
        const response = await api.get(endpoint, { params: { ...params, per_page: 1, context: 'view' } });
        return response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total'], 10) : 0;
      } catch (e) {
        console.warn(`Failed to get count for ${endpoint}`, e);
        return 0;
      }
    };
    
    const [totalPosts, totalPages, totalProducts] = await Promise.all([
        getCount(wpApi, '/posts'),
        getCount(wpApi, '/pages'),
        getCount(wooApi, 'products'),
    ]);

    const stats = {
      totalPosts,
      totalPages,
      totalContent: totalPosts + totalPages + totalProducts,
      totalProducts: totalProducts,
      languages: {}, // Language stats removed for performance, handled in other endpoints if needed
      status: {} // Status stats removed for performance
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching WordPress content stats:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content stats.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
