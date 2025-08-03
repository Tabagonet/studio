
// src/app/api/wordpress/content-list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

/**
 * Fetches all items for a specific content type by handling pagination.
 * @param api - The Axios instance to use (WP or Woo).
 * @param endpoint - The API endpoint (e.g., 'posts', 'pages').
 * @param params - The base query parameters.
 * @returns An array of all items for that content type.
 */
async function fetchAllContentOfType(api: AxiosInstance, endpoint: string, params: any): Promise<any[]> {
    let allItems: any[] = [];
    let page = 1;
    let totalPages = 1;

    do {
        try {
            const response = await api.get(endpoint, {
                params: {
                    ...params,
                    page: page,
                    per_page: 100, // Fetch max allowed per page to reduce requests
                }
            });

            if (response.data.length > 0) {
                allItems = allItems.concat(response.data);
            }

            totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages'], 10) : 0;
            page++;

        } catch (error: any) {
            if (error.response?.status === 400 && (error.response.data?.code === 'rest_no_route' || error.response.data?.code === 'rest_post_invalid_page_number')) {
                // This can happen if a post type isn't available (e.g., products) or we've passed the last page.
                console.warn(`Endpoint /${endpoint} not found or page out of bounds. Skipping content type.`);
                break; // Stop fetching for this type
            }
            // For other errors, we re-throw to be caught by the main handler.
            console.error(`Error fetching paginated content for ${endpoint}:`, error.message);
            throw error;
        }
    } while (page <= totalPages);

    return allItems;
}


// Helper to transform fetched data into the unified ContentItem format
function transformToContentItem(item: any, type: 'Post' | 'Page' | 'Producto', isFrontPage: boolean): ContentItem {
  const isProduct = type === 'Producto';
  return {
    id: item.id,
    title: item.name || item.title.rendered,
    type: type,
    link: item.permalink || item.link,
    status: item.status,
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified,
    is_front_page: isFrontPage,
  };
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
    
    const { wpApi, wooApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
      throw new Error('WordPress API is not configured for the active connection.');
    }
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '10', 10);
    const typeFilter = searchParams.get('type');
    const statusFilter = searchParams.get('status');
    const langFilter = searchParams.get('lang');
    const searchQuery = searchParams.get('q');
    
    const frontPageId = await wpApi.get('/options').then(res => res.data.page_on_front).catch(() => 0);

    const commonParams: any = {
      context: 'view',
      _embed: false, 
      orderby: 'modified',
      order: 'desc',
    };
    if (searchQuery) commonParams.search = searchQuery;
    if (statusFilter && statusFilter !== 'all') commonParams.status = statusFilter;
    if (langFilter && langFilter !== 'all') commonParams.lang = langFilter;
    
    let allContent: ContentItem[] = [];

    const typesToFetch = typeFilter && typeFilter !== 'all' ? [typeFilter] : ['Page', 'Post', 'Producto'];

    if (typesToFetch.includes('Page')) {
        const pages = await fetchAllContentOfType(wpApi, 'pages', commonParams);
        allContent.push(...pages.map((item: any) => transformToContentItem(item, 'Page', item.id === frontPageId)));
    }
    if (typesToFetch.includes('Post')) {
        const posts = await fetchAllContentOfType(wpApi, 'posts', commonParams);
        allContent.push(...posts.map((item: any) => transformToContentItem(item, 'Post', false)));
    }
    if (typesToFetch.includes('Producto') && wooApi) {
        const products = await fetchAllContentOfType(wooApi, 'products', commonParams);
        allContent.push(...products.map((item: any) => transformToContentItem(item, 'Producto', false)));
    }
    
    // Server-side Pagination on the combined list
    const totalItems = allContent.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const offset = (page - 1) * perPage;
    const paginatedContent = allContent.slice(offset, offset + perPage);

    return NextResponse.json({ 
        content: paginatedContent,
        total: totalItems,
        totalPages: totalPages,
    });

  } catch (error: any) {
    console.error(`[API /content-list] Critical error:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
