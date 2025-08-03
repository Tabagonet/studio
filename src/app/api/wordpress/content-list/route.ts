
// src/app/api/wordpress/content-list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

// Helper to fetch a specific content type with pagination
async function fetchContent(api: AxiosInstance, endpoint: string, params: any): Promise<{data: any[], totalPages: number}> {
  try {
    const response = await api.get(endpoint, { params });
    const totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages'], 10) : 1;
    return { data: response.data, totalPages };
  } catch (error: any) {
    if (error.response?.status === 400 && error.response.data?.code === 'rest_no_route') {
      // This happens if, for example, WooCommerce is not active. It's not a critical error.
      console.warn(`Endpoint /${endpoint} not found. Skipping content type.`);
      return { data: [], totalPages: 0 };
    }
    // For other errors, we re-throw to be caught by the main handler.
    throw error;
  }
}

// Helper to transform fetched data into the unified ContentItem format
function transformToContentItem(item: any, type: 'Post' | 'Page' | 'Producto'): ContentItem {
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
    is_front_page: get_option('page_on_front') == item.id,
  };
}

// Helper to get the value of a WordPress option
function get_option(option_name: string): any {
    // This is a simplified mock. In a real scenario, this might be another API call if needed.
    // For 'page_on_front', it's often handled client-side or during a full site analysis.
    // We are mocking a simple return as it's not critical for the main listing logic.
    return 0; // Returning a default/mock value
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

    const commonParams: any = {
      context: 'view',
      _embed: false, // We don't need embedded data for this list, saving bandwidth
      orderby: 'modified',
      order: 'desc',
    };
    if (searchQuery) commonParams.search = searchQuery;
    if (statusFilter && statusFilter !== 'all') commonParams.status = statusFilter;
    if (langFilter && langFilter !== 'all') commonParams.lang = langFilter;
    
    let allContent: ContentItem[] = [];

    const typesToFetch = typeFilter && typeFilter !== 'all' ? [typeFilter] : ['Page', 'Post', 'Producto'];

    if (typesToFetch.includes('Page')) {
        const { data } = await fetchContent(wpApi, 'pages', { ...commonParams, per_page: 100, page: 1 });
        allContent.push(...data.map((item: any) => transformToContentItem(item, 'Page')));
    }
    if (typesToFetch.includes('Post')) {
        const { data } = await fetchContent(wpApi, 'posts', { ...commonParams, per_page: 100, page: 1 });
        allContent.push(...data.map((item: any) => transformToContentItem(item, 'Post')));
    }
    if (typesToFetch.includes('Producto') && wooApi) {
        const { data } = await fetchContent(wooApi, 'products', { ...commonParams, per_page: 100, page: 1 });
        allContent.push(...data.map((item: any) => transformToContentItem(item, 'Producto')));
    }
    
    // Server-side Pagination
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
