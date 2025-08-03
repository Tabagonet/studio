

// src/app/api/wordpress/content-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

// Helper to transform fetched data into the unified ContentItem format
function transformToContentItem(item: any, type: ContentItem['type'], isFrontPage: boolean): ContentItem {
  const isProduct = type === 'Producto';
  return {
    id: item.id,
    title: item.name || item.title?.rendered || 'Sin Título',
    type: type,
    link: item.permalink || item.link,
    status: item.status || 'publish', // Categories don't have a status
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified || (item.date_created || new Date(0).toISOString()),
    is_front_page: isFrontPage,
  };
}

// Helper to fetch all items of a specific type, handling pagination
async function fetchAllOfType(api: AxiosInstance | null, endpoint: string, typeLabel: ContentItem['type'], frontPageId: number): Promise<ContentItem[]> {
    if (!api) return [];
    
    let allItems: any[] = [];
    let page = 1;
    const perPage = 100;
    
    while (true) {
        try {
            const response = await api.get(endpoint, {
                params: {
                    per_page: perPage,
                    page: page,
                    context: 'view',
                    _embed: 'wp:featuredmedia', 
                    lang: '',
                    status: 'any', 
                },
            });

            if (response.data.length === 0) break; 
            
            allItems = allItems.concat(response.data);
            
            const totalPagesHeader = response.headers['x-wp-totalpages'];
            const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 0;

            if (!totalPages || page >= totalPages) break;
            page++;
        } catch (error) {
            console.error(`Error fetching from ${endpoint}, page ${page}:`, error);
            break;
        }
    }

    return allItems.map(item => transformToContentItem(item, typeLabel, item.id === frontPageId));
}

// Fetch all categories (for posts or products)
async function fetchAllCategories(api: AxiosInstance | null, endpoint: string, typeLabel: 'Categoría de Entradas' | 'Categoría de Productos', wpApi: AxiosInstance): Promise<ContentItem[]> {
    if (!api) return [];
    try {
        const response = await api.get(endpoint, { params: { per_page: 100, context: 'view', lang: '' } });
        
        const terms = response.data.filter((cat: any) => cat.count > 0);
        if (terms.length === 0) return [];
        
        // Find the most recent post for each category to get a relevant modified date
        const latestPostPromises = terms.map((term: any) => 
            wpApi.get('posts', { 
                params: { 
                    [endpoint === 'categories' ? 'categories' : 'product_cat']: term.id,
                    per_page: 1, 
                    orderby: 'modified', 
                    order: 'desc',
                    _fields: 'modified'
                }
            }).then(res => res.data[0]?.modified || null).catch(() => null)
        );
        
        const latestPostDates = await Promise.all(latestPostPromises);

        return terms.map((cat: any, index: number) => ({
            id: cat.id,
            title: cat.name,
            type: typeLabel,
            link: cat.link,
            status: 'publish',
            parent: cat.parent || 0,
            lang: cat.lang || null,
            translations: cat.translations || {},
            modified: latestPostDates[index], // Use the fetched date
            is_front_page: false,
        }));
    } catch (error) {
        console.error(`Error fetching categories from ${endpoint}:`, error);
        return [];
    }
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
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const typeFilter = searchParams.get('type');
    const statusFilter = searchParams.get('status');
    const langFilter = searchParams.get('lang');
    const searchQuery = searchParams.get('q');
    
    const frontPageId = await wpApi.get('/options').then(res => res.data.page_on_front).catch(() => 0);
    
    const [pages, postCategories, productCategories] = await Promise.all([
        fetchAllOfType(wpApi, 'pages', 'Page', frontPageId),
        fetchAllCategories(wpApi, 'categories', 'Categoría de Entradas', wpApi),
        fetchAllCategories(wooApi, 'products/categories', 'Categoría de Productos', wpApi),
    ]);
    
    let allContent = [...pages, ...postCategories, ...productCategories];

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
    
    // --- Server-side Sorting (Default by title) ---
    allContent.sort((a, b) => a.title.localeCompare(b.title));
    
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
