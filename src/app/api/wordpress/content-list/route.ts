
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
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
    
    const { searchParams } = new URL(req.url);
    const typeFilter = searchParams.get('type') || 'all'; // 'all', 'post', 'page'
    const statusFilter = searchParams.get('status') || 'all'; // 'all', 'publish', 'draft'

    const params = {
      per_page: 100,
      status: statusFilter === 'all' ? 'publish,draft,pending,private' : statusFilter,
      _fields: 'id,title.rendered,link,type,status', // Add status
    };

    let posts: ContentItem[] = [];
    let pages: ContentItem[] = [];

    if (typeFilter === 'all' || typeFilter === 'post') {
        const postsResponse = await wpApi.get('/posts', { params });
        posts = postsResponse.data.map((post: any) => ({
            id: post.id,
            title: post.title.rendered,
            type: 'Post',
            link: post.link,
            status: post.status,
        }));
    }

    if (typeFilter === 'all' || typeFilter === 'page') {
         const pagesResponse = await wpApi.get('/pages', { params });
         pages = pagesResponse.data.map((page: any) => ({
            id: page.id,
            title: page.title.rendered,
            type: 'Page',
            link: page.link,
            status: page.status,
        }));
    }
    
    const combinedContent = [...posts, ...pages].sort((a, b) => a.title.localeCompare(b.title));
        
    return NextResponse.json({ content: combinedContent });
  } catch (error: any) {
    console.error(`Error fetching content list:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
