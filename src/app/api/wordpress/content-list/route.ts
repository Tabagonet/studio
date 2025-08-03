// src/app/api/wordpress/content-list/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

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
      per_page: perPage,
      page: page,
      _embed: false, 
      orderby: 'modified',
      order: 'desc',
    };
    if (searchQuery) commonParams.search = searchQuery;
    if (statusFilter && statusFilter !== 'all') commonParams.status = statusFilter;
    if (langFilter && langFilter !== 'all') commonParams.lang = langFilter;
    
    let allContent: ContentItem[] = [];
    let totalItems = 0;
    let totalPages = 0;
    
    // Determine which single type to fetch, or fetch all if no filter
    const typesToFetch = typeFilter && typeFilter !== 'all' ? [typeFilter] : ['Page', 'Post', 'Producto'];

    let api: AxiosInstance | null = null;
    let endpoint = '';
    let typeLabel: 'Post' | 'Page' | 'Producto' = 'Page';

    if (typesToFetch.length === 1) {
        const singleType = typesToFetch[0];
        if (singleType === 'Page') {
            api = wpApi;
            endpoint = 'pages';
            typeLabel = 'Page';
        } else if (singleType === 'Post') {
            api = wpApi;
            endpoint = 'posts';
            typeLabel = 'Post';
        } else if (singleType === 'Producto') {
            api = wooApi;
            endpoint = 'products';
            typeLabel = 'Producto';
        }
    } else {
        // This multi-type fetch is more complex and might be less performant.
        // For simplicity and correctness with pagination, we handle it separately.
        // Here, we just return an empty array if "all" is selected, forcing user to pick a type.
        // This is a safe fallback to prevent the previous complex/buggy logic.
         return NextResponse.json({ 
            content: [],
            total: 0,
            totalPages: 0,
        });
    }

    if (api && endpoint) {
        const response = await api.get(endpoint, { params: commonParams });
        allContent = response.data.map((item: any) => transformToContentItem(item, typeLabel, item.id === frontPageId));
        totalItems = parseInt(response.headers['x-wp-total'] || '0', 10);
        totalPages = parseInt(response.headers['x-wp-totalpages'] || '0', 10);
    }

    return NextResponse.json({ 
        content: allContent,
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
