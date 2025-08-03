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
    slug: item.slug || null,
    type: type,
    link: item.permalink || item.link || null,
    status: item.status || 'publish',
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified || item.date_created || null,
    is_front_page: isFrontPage,
  };
}

async function fetchContentPage(
  api: AxiosInstance | null,
  postType: 'pages' | 'categories' | 'posts',
  page: number,
  perPage: number
): Promise<{ data: any[], totalPages: number }> {
  if (!api) return { data: [], totalPages: 0 };
  try {
    const response = await api.get(postType, {
      params: {
        per_page: perPage,
        page: page,
        context: 'view',
        _embed: false,
        lang: '', // Fetch all languages
        status: 'publish,future,draft,pending,private,trash'
      }
    });
    return {
      data: response.data,
      totalPages: parseInt(response.headers['x-wp-totalpages'] || '1', 10)
    };
  } catch (error) {
    console.warn(`Could not fetch content type "${postType}" (page ${page}):`, (error as any).message);
    return { data: [], totalPages: 0 };
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

    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        return NextResponse.json({ content: [], totalPages: 0 });
    }
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    const [pagesResponse, categoriesResponse] = await Promise.all([
      fetchContentPage(wpApi, 'pages', page, perPage),
      fetchContentPage(wpApi, 'categories', 1, 100) // Fetch all categories
    ]);

    const frontPageId = Number(get_option('page_on_front', 0));
    let allFrontPageIds = new Set<number>();
    if (frontPageId > 0) {
      allFrontPageIds.add(frontPageId);
      if (typeof (wpApi as any).pll_get_post_translations === 'function') {
        try {
            const translations = await (wpApi as any).pll_get_post_translations(frontPageId);
            Object.values(translations).forEach(id => allFrontPageIds.add(id as number));
        } catch(e) {
             console.warn("Polylang functions may not be available for page_on_front.");
        }
      }
    }
    
    const pages = pagesResponse.data.map((item: any) => transformToContentItem(item, 'Page', allFrontPageIds.has(item.id)));
    const categories = categoriesResponse.data.map((item: any) => transformToContentItem(item, 'Categoría de Entradas', false));
    
    const allContent = [...pages, ...categories];
    
    return NextResponse.json({ 
        content: allContent,
        totalPages: pagesResponse.totalPages
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

// Dummy function to satisfy type checker, as get_option is a WP function
function get_option(key: string, defaultValue: any): any {
    return defaultValue;
}
