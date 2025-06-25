

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';


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

    let languageDataMissing = false;

    // Define the fields we need to reduce payload size and prevent timeouts/memory issues
    const fields = ['id', 'title', 'type', 'link', 'status', 'parent', 'lang', 'translations'];
    const commonParams = {
        per_page: 100,
        status: 'publish,draft,pending,private,future',
        orderby: 'title',
        order: 'asc',
        context: 'view', // Use 'view' context which is much lighter
        _fields: fields.join(','), // Request only these fields
    };

    // Fetch pages and posts sequentially to avoid overloading the user's server
    const postsResponse = await wpApi.get('/posts', { params: commonParams });
    const pagesResponse = await wpApi.get('/pages', { params: commonParams });

    const mapContent = (item: any): ContentItem => {
        // Check for the 'lang' field provided by the user's custom plugin.
        // If it's missing for any item, we flag it.
        if (item.lang === undefined || item.translations === undefined) {
          languageDataMissing = true;
        }

        return {
            id: item.id,
            title: item.title?.rendered || 'No Title',
            type: item.type === 'post' ? 'Post' : 'Page',
            link: item.link,
            status: item.status,
            parent: item.parent || 0,
            lang: item.lang || 'default', // Fallback to 'default' if missing
            translations: item.translations || {},
        };
    };
    
    const posts = postsResponse.data.map(mapContent);
    const pages = pagesResponse.data.map(mapContent);
    
    const finalContent = [...posts, ...pages];
        
    return NextResponse.json({ 
        content: finalContent,
        languageDataMissing: languageDataMissing
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
