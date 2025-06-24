
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
  parent: number | null;
  lang: string;
  translations: Record<string, number>;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const params = {
      per_page: 100, 
      status: 'publish,draft,pending,private,future',
      orderby: 'title',
      order: 'asc',
      context: 'view',
      _embed: true, // Ensure we get embedded data which might include language info from some plugins
    };

    const [postsResponse, pagesResponse] = await Promise.all([
      wpApi.get('/posts', { params }),
      wpApi.get('/pages', { params })
    ]);
   
    const mapContent = (item: any): ContentItem => {
        return {
            id: item.id,
            title: item.title?.rendered || 'No Title',
            type: item.type === 'post' ? 'Post' : 'Page',
            link: item.link,
            status: item.status,
            parent: item.parent || null,
            lang: item.lang || 'default', 
            translations: item.translations || {},
        };
    };

    const posts: ContentItem[] = postsResponse.data.map(mapContent);
    const pages: ContentItem[] = pagesResponse.data.map(mapContent);
    
    const combinedContent = [...posts, ...pages]; 
        
    return NextResponse.json({ content: combinedContent });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
