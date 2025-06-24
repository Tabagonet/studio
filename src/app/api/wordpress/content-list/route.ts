
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
}

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

    const params = {
      per_page: 100, // Fetch up to 100 of each, adjust if needed
      status: 'publish', // Only fetch published content
      _fields: 'id,title.rendered,link,type', // Optimize by fetching only needed fields
    };

    const [postsResponse, pagesResponse] = await Promise.all([
      wpApi.get('/posts', { params }),
      wpApi.get('/pages', { params })
    ]);

    const posts: ContentItem[] = postsResponse.data.map((post: any) => ({
      id: post.id,
      title: post.title.rendered,
      type: 'Post',
      link: post.link,
    }));

    const pages: ContentItem[] = pagesResponse.data.map((page: any) => ({
      id: page.id,
      title: page.title.rendered,
      type: 'Page',
      link: page.link,
    }));
    
    const combinedContent = [...posts, ...pages].sort((a, b) => a.title.localeCompare(b.title));
        
    return NextResponse.json({ content: combinedContent });
  } catch (error: any) {
    console.error(`Error fetching content list:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
