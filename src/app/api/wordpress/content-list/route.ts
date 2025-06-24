
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
  parent: number;
  lang: string; // Will be default
  translations: Record<string, number>; // Will be empty
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

    const fetchParams = {
        per_page: 100, 
        status: 'publish,draft,pending,private,future',
        orderby: 'title',
        order: 'asc',
        context: 'view',
    };

    const [postsResponse, pagesResponse] = await Promise.all([
        wpApi.get('/posts', { params: fetchParams }).catch(e => { console.error(`Failed to fetch posts`, e.response?.data); return { data: [] }; }),
        wpApi.get('/pages', { params: fetchParams }).catch(e => { console.error(`Failed to fetch pages`, e.response?.data); return { data: [] }; })
    ]);

    const allContent: ContentItem[] = [];

    const mapContent = (item: any): ContentItem => {
        return {
            id: item.id,
            title: item.title?.rendered || 'No Title',
            type: item.type === 'post' ? 'Post' : 'Page',
            link: item.link,
            status: item.status,
            parent: item.parent || 0,
            // We cannot detect language, so we fall back to a default value.
            lang: 'default', 
            translations: item.translations || {},
        };
    };

    const posts: ContentItem[] = postsResponse.data.map(mapContent);
    const pages: ContentItem[] = pagesResponse.data.map(mapContent);

    allContent.push(...posts, ...pages);
        
    return NextResponse.json({ content: allContent });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
