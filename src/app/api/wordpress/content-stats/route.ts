

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

    // Fetch all posts and pages to get language data
    const postsResponse = await wpApi.get('/posts', { params: { per_page: 100, context: 'view', _fields: 'id,lang' }});
    const pagesResponse = await wpApi.get('/pages', { params: { per_page: 100, context: 'view', _fields: 'id,lang' }});
    
    const allContent = [...postsResponse.data, ...pagesResponse.data];
    
    const languageCounts: { [key: string]: number } = {};
    allContent.forEach(item => {
        const lang = item.lang || 'unknown';
        languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    });

    const getCount = async (endpoint: string): Promise<number> => {
      try {
        const response = await wpApi.get(endpoint, { params: { per_page: 1, context: 'view' } });
        return response.headers['x-wp-total'] ? parseInt(response.headers['x-wp-total'], 10) : 0;
      } catch (e) {
        console.error(`Failed to get count for ${endpoint}`, e);
        return 0;
      }
    };
    
    const [totalPosts, totalPages] = await Promise.all([
        getCount('/posts'),
        getCount('/pages')
    ]);

    const stats = {
      totalPosts,
      totalPages,
      totalContent: totalPosts + totalPages,
      languages: languageCounts,
      // Status stats are removed as language stats are more valuable here
      status: {}
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching WordPress content stats:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content stats.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

    