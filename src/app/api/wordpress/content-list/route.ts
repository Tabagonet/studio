// src/app/api/wordpress/content-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

// Helper to transform fetched data into the unified ContentItem format
function transformToContentItem(item: any, type: ContentItem['type'], isFrontPage: boolean): ContentItem {
  let title = 'Sin Título';
  if (item.name) {
    // For products and categories
    title = typeof item.name === 'object' ? item.name.rendered : item.name;
  } else if (item.title) {
    // For posts and pages
    title = item.title.rendered;
  }

  return {
    id: item.id,
    title: title,
    slug: item.slug || null,
    type: type,
    link: item.link || null,
    status: item.status || 'publish',
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified || item.date_created || null,
    is_front_page: isFrontPage,
  };
}

// Unified function to fetch any content type
async function fetchContent(
  api: AxiosInstance,
  endpoint: string,
  type: ContentItem['type'],
  allFrontPageIds: Set<number>,
  page: number,
  perPage: number,
): Promise<{ items: ContentItem[], totalPages: number }> {
  try {
    const response = await api.get(endpoint, {
      params: {
        per_page: perPage,
        page: page,
        context: 'view',
        _embed: false,
        lang: '', // Fetch all languages
        status: 'publish,future,draft,pending,private,trash'
      }
    });

    const items = response.data.map((item: any) => transformToContentItem(item, type, allFrontPageIds.has(item.id)));
    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
    
    return { items, totalPages };
  } catch (error) {
    // Gracefully handle if a post type doesn't exist (e.g., 'products' without Woo)
    if ((error as any).response?.status === 404) {
        console.warn(`Endpoint /${endpoint} not found. Skipping this content type.`);
        return { items: [], totalPages: 0 };
    }
    console.error(`Could not fetch content type "${endpoint}" (page ${page}):`, (error as any).message);
    throw error; // Re-throw other errors
  }
}

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi, wooApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        // If there's no WP connection, we can't fetch anything.
        return NextResponse.json({ content: [], totalPages: 0 });
    }
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    // Determine front page ID to mark it in the list
    let allFrontPageIds = new Set<number>();
    try {
        const settingsRes = await wpApi.get('/settings');
        const frontPageId = settingsRes.data?.page_on_front;
        if (frontPageId) {
            allFrontPageIds.add(frontPageId);
            if (typeof (wpApi as any).pll_get_post_translations === 'function') {
                const translations = await (wpApi as any).pll_get_post_translations(frontPageId);
                Object.values(translations).forEach(id => allFrontPageIds.add(id as number));
            }
        }
    } catch(e) {
        console.warn("Could not retrieve site settings to determine front page.");
    }
    
    // Fetch all content types in parallel
    const contentPromises = [
        fetchContent(wpApi, 'pages', 'Page', allFrontPageIds, page, perPage),
        fetchContent(wpApi, 'posts', 'Post', allFrontPageIds, page, perPage),
        fetchContent(wooApi, 'products', 'Producto', allFrontPageIds, page, perPage),
        fetchContent(wpApi, 'categories', 'Categoría de Entradas', allFrontPageIds, 1, 100), // Fetch all categories
        fetchContent(wooApi, 'products/categories', 'Categoría de Productos', allFrontPageIds, 1, 100), // Fetch all product categories
    ];

    const results = await Promise.allSettled(contentPromises);
    
    const allContent: ContentItem[] = [];
    let maxTotalPages = 0;

    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            allContent.push(...result.value.items);
            if(result.value.totalPages > maxTotalPages) {
                maxTotalPages = result.value.totalPages;
            }
        }
    });
    
    return NextResponse.json({ 
        content: allContent,
        totalPages: maxTotalPages,
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch content list.';
    const status = error.message?.includes('not configured') ? 400 : (error.response?.status || 500);
    console.error("Critical error in content-list API:", error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
