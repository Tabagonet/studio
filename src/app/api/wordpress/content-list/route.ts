

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
        // Return an empty list if not configured, UI will show a message
        return NextResponse.json({ content: [], totalPages: 0 });
    }
    
    const { searchParams } = new URL(req.url);

    let frontPageId = 0;
    try {
        const optionsResponse = await wpApi.get('/options');
        frontPageId = optionsResponse.data.page_on_front || 0;
    } catch(e) {
        console.warn("Could not fetch 'page_on_front' option.");
    }

    const params: any = {
        per_page: searchParams.get('per_page') || 10,
        page: searchParams.get('page') || 1,
        context: 'view',
        _embed: 'wp:featuredmedia', 
        lang: searchParams.get('lang') || undefined,
        status: searchParams.get('status') || 'publish,draft,pending,private,future,trash',
    };
    if (searchParams.get('q')) params.search = searchParams.get('q');
    if (searchParams.get('category')) params.categories = [searchParams.get('category')];

    // Fetch Pages
    const pagesResponse = await wpApi.get('pages', { params });
    const pages = pagesResponse.data.map((item: any) => transformToContentItem(item, 'Page', item.id === frontPageId));
    const totalPages = pagesResponse.headers['x-wp-totalpages'] ? parseInt(pagesResponse.headers['x-wp-totalpages'], 10) : 0;
    
    // Fetch Categories
    let categories: ContentItem[] = [];
    if (!searchParams.get('q')) { // Don't fetch categories when searching
      try {
          const categoriesResponse = await wpApi.get("categories", { params: { per_page: 100 } });
          categories = categoriesResponse.data.map((cat: any) => transformToContentItem(cat, 'Categoría de Entradas', false));
      } catch (e) {
          console.error("Failed to fetch categories", e);
      }
    }
    
    // Combine and send
    const allContent = [...pages, ...categories];

    return NextResponse.json({ 
        content: allContent,
        totalPages: totalPages,
    });

  } catch (error: any) {
    console.error(`[API /content-list] Critical error:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
