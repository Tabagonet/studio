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
  let imageUrl: string | null = null;
  if (isProduct) {
      if (item.images && item.images.length > 0 && item.images[0].src) {
          imageUrl = item.images[0].src;
      }
  } else {
      imageUrl = item._embedded?.['wp:featuredmedia']?.[0]?.source_url || null;
  }

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

// Helper to fetch all items of a specific type, handling pagination
async function fetchAllOfType(api: AxiosInstance | null, endpoint: string, typeLabel: 'Post' | 'Page' | 'Producto', frontPageId: number): Promise<ContentItem[]> {
    if (!api) return [];
    
    let allItems: any[] = [];
    let page = 1;
    const perPage = 100; // Fetch 100 items per request
    
    while (true) {
        try {
            const response = await api.get(endpoint, {
                params: {
                    per_page: perPage,
                    page: page,
                    context: 'view',
                    _embed: 'author,wp:featuredmedia,wp:term', // Ensure necessary data is embedded
                    lang: '', // Fetch all languages
                    status: 'any', // Fetch all statuses
                },
            });

            if (response.data.length === 0) {
                break; // No more items to fetch
            }
            
            allItems = allItems.concat(response.data);
            
            const totalPages = response.headers['x-wp-totalpages'];
            if (!totalPages || page >= parseInt(totalPages, 10)) {
                break; // Reached the last page
            }
            page++;
        } catch (error) {
            console.error(`Error fetching from ${endpoint}, page ${page}:`, error);
            break; // Stop fetching on error
        }
    }

    return allItems.map(item => transformToContentItem(item, typeLabel, item.id === frontPageId));
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
    
    // Fetch all content types in parallel
    const [pages, posts, products] = await Promise.all([
        fetchAllOfType(wpApi, 'pages', 'Page', frontPageId),
        fetchAllOfType(wpApi, 'posts', 'Post', frontPageId),
        fetchAllOfType(wooApi, 'products', 'Producto', frontPageId),
    ]);
    
    let allContent = [...pages, ...posts, ...products];

    // --- Server-side Filtering ---
    if (searchQuery) {
        allContent = allContent.filter(item => item.title.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    if (typeFilter && typeFilter !== 'all') {
        allContent = allContent.filter(item => item.type === typeFilter);
    }
    if (statusFilter && statusFilter !== 'all') {
        allContent = allContent.filter(item => item.status === statusFilter);
    }
    if (langFilter && langFilter !== 'all') {
        allContent = allContent.filter(item => item.lang === langFilter);
    }
    
    // --- Server-side Sorting ---
    allContent.sort((a, b) => {
        // Default sort by modified date, descending
        const dateA = a.modified ? new Date(a.modified).getTime() : 0;
        const dateB = b.modified ? new Date(b.modified).getTime() : 0;
        return dateB - dateA;
    });
    
    // --- Server-side Pagination ---
    const totalItems = allContent.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const paginatedContent = allContent.slice((page - 1) * perPage, page * perPage);

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
