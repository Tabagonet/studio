
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
  console.log('[API /content-list] Request received.');
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        console.error('[API /content-list] No auth token provided.');
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      console.error('[API /content-list] Firebase Admin Auth is not initialized.');
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    console.log(`[API /content-list] User authenticated: ${uid}`);
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        console.error('[API /content-list] WordPress API is not configured for the active connection.');
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const params = {
      per_page: 100, 
      status: 'publish,draft,pending,private,future',
      orderby: 'title',
      order: 'asc',
      // No _fields parameter to get the full object
    };

    console.log('[API /content-list] Fetching posts and pages from WordPress...');
    const [postsResponse, pagesResponse] = await Promise.all([
      wpApi.get('/posts', { params }),
      wpApi.get('/pages', { params })
    ]);
    console.log('[API /content-list] Fetched data successfully.');
   
    // --- START OF DIAGNOSTIC LOGGING ---
    if (postsResponse.data.length > 0) {
        console.log('[API /content-list] DIAGNOSTIC: Structure of the first post object received:');
        console.log(JSON.stringify(postsResponse.data[0], null, 2));
    } else {
         console.log('[API /content-list] DIAGNOSTIC: No posts were returned from the API.');
    }
    if (pagesResponse.data.length > 0) {
        console.log('[API /content-list] DIAGNOSTIC: Structure of the first page object received:');
        console.log(JSON.stringify(pagesResponse.data[0], null, 2));
    } else {
         console.log('[API /content-list] DIAGNOSTIC: No pages were returned from the API.');
    }
    // --- END OF DIAGNOSTIC LOGGING ---

    const mapContent = (item: any): ContentItem => ({
        id: item.id,
        title: item.title.rendered,
        type: item.type === 'post' ? 'Post' : 'Page',
        link: item.link,
        status: item.status,
        parent: item.parent || null,
        // The crucial part: checking if `item.lang` exists. If not, it falls back to 'default'.
        lang: item.lang || 'default', 
        translations: item.translations || {},
    });

    const posts: ContentItem[] = postsResponse.data.map(mapContent);
    const pages: ContentItem[] = pagesResponse.data.map(mapContent);
    
    const combinedContent = [...posts, ...pages]; 
        
    console.log(`[API /content-list] Processed ${combinedContent.length} items.`);
    return NextResponse.json({ content: combinedContent });
  } catch (error: any) {
    console.error(`[API /content-list] CRITICAL ERROR:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
