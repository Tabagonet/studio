

// src/app/api/wordpress/content-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

// Helper to transform fetched data into the unified ContentItem format
function transformToContentItem(item: any, type: ContentItem['type'], isFrontPage: boolean): ContentItem {
  return {
    id: item.id,
    title: item.name || item.title?.rendered || 'Sin Título',
    slug: item.slug || '',
    type: type,
    link: item.permalink || item.link || null,
    status: item.status || 'publish',
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified || item.date_created || null,
    is_front_page: isFrontPage || false,
  };
}

// Helper to fetch all items of a specific type, handling pagination
async function fetchAllOfType(api: AxiosInstance, endpoint: string, typeLabel: ContentItem['type'], frontPageId: number, requestParams: URLSearchParams): Promise<{items: ContentItem[], totalPages: number}> {
    if (!api) return { items: [], totalPages: 0 };

    const params: any = {
        per_page: requestParams.get('per_page') || 10,
        page: requestParams.get('page') || 1,
        context: 'view',
        _embed: 'wp:featuredmedia', 
        lang: '', // Fetch all languages
    };
    
    // Apply filters from the request
    const search = requestParams.get('search');
    const status = requestParams.get('status');
    const lang = requestParams.get('lang');
    if (search) params.search = search;
    if (status && status !== 'all') params.status = status;
    if (lang && lang !== 'all') params.lang = lang;


    try {
        const response = await api.get(endpoint, { params });
        const totalPagesHeader = response.headers['x-wp-totalpages'];
        const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 0;
        
        const items = response.data.map((item: any) => transformToContentItem(item, typeLabel, item.id === frontPageId));

        return { items, totalPages };
    } catch (error) {
        console.error(`Error fetching from ${endpoint}:`, error);
        return { items: [], totalPages: 0 };
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
    
    if (!adminDb) {
      throw new Error("Firestore Admin is not initialized.");
    }

    const { wpApi, wooApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured.');
    }
    
    const { searchParams } = new URL(req.url);

    let frontPageId = 0;
    try {
        const optionsResponse = await wpApi.get('/options');
        frontPageId = optionsResponse.data.page_on_front || 0;
    } catch(e) {
        console.warn("Could not fetch 'page_on_front' option.");
    }

    const {items: pages, totalPages: pagesTotalPages} = await fetchAllOfType(wpApi, 'pages', 'Page', frontPageId, searchParams);
    
    const categoryId = searchParams.get('category');
    let categories: ContentItem[] = [];
    
    // Only fetch categories if the category filter is set or no search query is active
    if (!searchParams.get('search')) {
        try {
            const categoriesResponse = await wpApi.get("categories", { params: { per_page: 100 } });
            categories = categoriesResponse.data.map((cat: any) => transformToContentItem(cat, 'Categoría de Entradas', false));
        } catch (e) {
            console.error("Failed to fetch categories", e);
        }
    }
    
    let allContent = [...pages, ...categories];
    
    // Apply category filter in memory if necessary
    if (categoryId && categoryId !== 'all') {
        const categoryPostsResponse = await wpApi.get('posts', { params: { categories: [categoryId], per_page: 100, _fields: 'id' } });
        const postIdsInCategory = new Set(categoryPostsResponse.data.map((p: any) => p.id));
        allContent = allContent.filter(item => postIdsInCategory.has(item.id));
    }

    return NextResponse.json({ 
        content: allContent,
        totalPages: pagesTotalPages, // For now, pagination is mainly driven by pages
    });

  } catch (error: any) {
    console.error(`[API /content-list] Critical error:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
