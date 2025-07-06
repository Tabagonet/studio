
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

async function fetchAllPaginatedContent(wpApi: AxiosInstance, endpoint: string) {
    let allContent: any[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
        const response = await wpApi.get(endpoint, {
            params: {
                per_page: perPage,
                page: page,
                context: 'view', // context=view is necessary for register_rest_field
                status: 'publish,future,draft,pending,private',
                // Request only necessary fields for performance, including our custom ones.
                _fields: 'id,title,type,link,status,parent,lang,translations,meta,modified',
            },
        });

        if (response.data.length === 0) {
            break; // No more content to fetch
        }

        allContent = allContent.concat(response.data);

        const totalPages = response.headers['x-wp-totalpages'];
        if (!totalPages || page >= parseInt(totalPages, 10)) {
            break;
        }
        page++;
    }
    return allContent;
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

    const [posts, pages, products] = await Promise.all([
        fetchAllPaginatedContent(wpApi, '/posts'),
        fetchAllPaginatedContent(wpApi, '/pages'),
        fetchAllPaginatedContent(wpApi, '/products'), // Fetch products as well
    ]);

    const combinedContent = [...posts, ...pages, ...products].map(item => {
        let itemType: 'Post' | 'Page' | 'Producto' = 'Post';
        if (item.type === 'page') itemType = 'Page';
        if (item.type === 'product') itemType = 'Producto';

        return {
            id: item.id,
            title: item.title?.rendered || 'Sin Título',
            type: itemType,
            link: item.link,
            status: item.status,
            parent: item.parent || 0,
            lang: item.lang || null,
            translations: item.translations || {},
            modified: item.modified,
        }
    });

    return NextResponse.json({ content: combinedContent });

  } catch (error: any) {
    let errorMessage = 'Failed to fetch content list.';
    let status = error.response?.status || 500;

    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
