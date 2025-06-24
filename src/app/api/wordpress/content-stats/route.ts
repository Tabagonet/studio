
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;

    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
      throw new Error('WordPress API is not configured for the active connection.');
    }

    const getCount = async (endpoint: string, params: any = {}): Promise<number> => {
      try {
        const response = await wpApi.get(endpoint, { params: { ...params, per_page: 1, context: 'view' } });
        return response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total'], 10) : 0;
      } catch (e) {
        console.error(`Failed to get count for ${endpoint} with params: ${JSON.stringify(params)}`, e);
        return 0;
      }
    };

    const allStatuses = 'publish,draft,pending,private,future';

    const [
      totalPosts,
      publishedPosts,
      draftPosts,
      totalPages,
      publishedPages,
      draftPages,
    ] = await Promise.all([
      getCount('/posts', { status: allStatuses }),
      getCount('/posts', { status: 'publish' }),
      getCount('/posts', { status: 'draft' }),
      getCount('/pages', { status: allStatuses }),
      getCount('/pages', { status: 'publish' }),
      getCount('/pages', { status: 'draft' }),
    ]);
    
    const stats = {
      totalPosts,
      totalPages,
      totalContent: totalPosts + totalPages,
      status: {
          publish: publishedPosts + publishedPages,
          draft: draftPosts + draftPages,
      }
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching WordPress content stats:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content stats.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
