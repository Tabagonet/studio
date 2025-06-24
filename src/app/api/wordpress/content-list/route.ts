
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
  lang: string; // e.g., 'ES', 'EN'
  translations: Record<string, number>;
}

export async function GET(req: NextRequest) {
  console.log('[API /content-list] Request received. Re-running diagnostics.');
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    console.log(`[API /content-list] User authenticated: ${uid}`);
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    console.log('[API /content-list] Fetching all posts and pages in a single request for diagnostics...');
    const [postsResponse, pagesResponse] = await Promise.all([
        wpApi.get('/posts', { params: { per_page: 100, status: 'publish,draft,pending,private,future', orderby: 'title', order: 'asc', context: 'view' } }),
        wpApi.get('/pages', { params: { per_page: 100, status: 'publish,draft,pending,private,future', orderby: 'title', order: 'asc', context: 'view' } })
    ]);
    console.log('[API /content-list] Fetched data successfully.');

    if (postsResponse.data.length > 0) {
        console.log("--- START OF DIAGNOSTIC LOG (POST) ---");
        console.log("[API /content-list] Full object structure of the first post received from your WordPress site:");
        console.log(JSON.stringify(postsResponse.data[0], null, 2));
        console.log("--- END OF DIAGNOSTIC LOG (POST) ---");
    } else {
        console.log("[API /content-list] No posts found to log.");
    }

    if (pagesResponse.data.length > 0) {
        console.log("--- START OF DIAGNOSTIC LOG (PAGE) ---");
        console.log("[API /content-list] Full object structure of the first page received from your WordPress site:");
        console.log(JSON.stringify(pagesResponse.data[0], null, 2));
        console.log("--- END OF DIAGNOSTIC LOG (PAGE) ---");
    } else {
        console.log("[API /content-list] No pages found to log.");
    }

    const mapContent = (item: any): Omit<ContentItem, 'lang' | 'translations'> & { raw: any } => ({
        id: item.id,
        title: item.title?.rendered || 'No Title',
        type: item.type === 'post' ? 'Post' : 'Page',
        link: item.link,
        status: item.status,
        parent: item.parent || 0,
        raw: item, // Keep the raw data for now
    });
    
    const posts = postsResponse.data.map(mapContent);
    const pages = pagesResponse.data.map(mapContent);
    
    const allContentData = [...posts, ...pages];

    // Post-processing to find language
    const finalContent = allContentData.map(item => {
        // This is a temporary assignment to ensure the list appears.
        // The real logic will be added after analyzing the new diagnostic logs.
        const lang = item.raw.lang || 'default';

        return {
            id: item.id,
            title: item.title,
            type: item.type,
            link: item.link,
            status: item.status,
            parent: item.parent,
            lang: lang.toUpperCase(),
            translations: item.raw.translations || {},
        };
    });
        
    return NextResponse.json({ content: finalContent });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
