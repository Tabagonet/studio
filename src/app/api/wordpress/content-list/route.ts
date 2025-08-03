
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

async function fetchAllOfType(api: AxiosInstance | null, type: 'pages' | 'categories') {
    if (!api) return [];

    let allItems: any[] = [];
    let page = 1;
    while (true) {
        try {
            const response = await api.get(type, {
                params: {
                    per_page: 100,
                    page: page,
                    context: 'view',
                    _embed: false, 
                    lang: '', // Fetch all languages
                    status: 'publish,future,draft,pending,private,trash'
                }
            });
            if (response.data.length === 0) break;
            allItems = allItems.concat(response.data);
            page++;
        } catch (error) {
            console.error(`Error fetching ${type} (page ${page}):`, (error as any).message);
            break; 
        }
    }
    return allItems;
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
        return NextResponse.json({ content: [] });
    }
    
    let frontPageId = 0;
    try {
        const optionsResponse = await wpApi.get('/options');
        frontPageId = optionsResponse.data?.page_on_front || 0;
    } catch(e) {
        console.warn("Could not fetch 'page_on_front' option.");
    }
    const allFrontPageIds = new Set<number>();
    if (frontPageId > 0 && typeof (wpApi as any).pll_get_post_translations === 'function') {
        try {
            const translations = await (wpApi as any).pll.get_post_translations(frontPageId);
            Object.values(translations).forEach(id => allFrontPageIds.add(id as number));
        } catch(e) {
            console.warn("Polylang functions may not be available for page_on_front.");
        }
    } else if (frontPageId > 0) {
        allFrontPageIds.add(frontPageId);
    }


    const [pagesData, categoriesData] = await Promise.all([
        fetchAllOfType(wpApi, 'pages'),
        fetchAllOfType(wpApi, 'categories')
    ]);

    const pages = pagesData.map((item: any) => transformToContentItem(item, 'Page', allFrontPageIds.has(item.id)));
    const categories = categoriesData.map((item: any) => transformToContentItem(item, 'Categoría de Entradas', false));
    
    const allContent = [...pages, ...categories];

    return NextResponse.json({ 
        content: allContent,
    });

  } catch (error: any) {
    console.error(`[API /content-list] Critical error:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
