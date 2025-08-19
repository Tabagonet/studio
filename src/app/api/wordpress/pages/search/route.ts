// src/app/api/wordpress/pages/search/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem, HierarchicalContentItem } from '@/lib/types';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

function transformPageToContentItem(page: any, allFrontPageIds: Set<number>): ContentItem {
  return {
    id: page.id,
    title: page.title.rendered,
    slug: page.slug || null,
    type: 'Page',
    link: page.link || null,
    status: page.status || 'publish',
    parent: page.parent || 0,
    lang: page.lang || null,
    translations: page.translations || {},
    modified: page.modified || page.date_created || null,
    is_front_page: allFrontPageIds.has(page.id),
  };
}

// Fetches ALL pages from WordPress by iterating through paginated results.
async function fetchAllPages(wpApi: AxiosInstance): Promise<Map<number, ContentItem>> {
    const allPagesMap = new Map<number, ContentItem>();
    let currentPage = 1;
    const perPage = 100; // Max allowed by WordPress

    while (true) {
        try {
            const response = await wpApi.get('pages', {
                params: {
                    per_page: perPage,
                    page: currentPage,
                    context: 'view',
                    _fields: 'id,lang,translations,parent,title,status,link,modified,slug,date', // Added date for sorting fallback
                    lang: '', // Fetch all languages
                    status: 'publish,future,draft,pending,private,trash'
                }
            });
            
            if (response.data.length === 0) {
                break; // No more pages left
            }

            response.data.forEach((page: any) => {
                // Pass an empty set for front page IDs here, it will be corrected later
                allPagesMap.set(page.id, transformPageToContentItem(page, new Set()));
            });

            currentPage++;
        } catch (error) {
            console.error(`Error fetching page IDs on page ${currentPage}:`, error);
            break; // Exit loop on error
        }
    }
    return allPagesMap;
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
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        return NextResponse.json({ pages: [], totalPages: 0, totalItems: 0 });
    }
    
    // Step 1: Fetch all pages with minimal data to build a complete translation map
    const allPagesMap = await fetchAllPages(wpApi);

    // Step 2: Determine front page ID(s)
    let allFrontPageIds = new Set<number>();
    try {
        const settingsRes = await wpApi.get('/settings');
        const frontPageId = settingsRes.data?.page_on_front;
        if (frontPageId) {
            const frontPageTranslations = allPagesMap.get(frontPageId)?.translations || {};
            allFrontPageIds.add(frontPageId); // Add the main front page ID
            Object.values(frontPageTranslations).forEach(id => allFrontPageIds.add(id as number));
        }
    } catch(e) {
        console.warn("Could not retrieve site settings to determine front page.");
    }
    
    // Update is_front_page status in our map
    allPagesMap.forEach(page => {
        page.is_front_page = allFrontPageIds.has(page.id);
    });

    // Step 3: Filter and build hierarchy from the complete in-memory list
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '10', 10);
    const titleFilter = searchParams.get('title') || '';
    const statusFilter = searchParams.get('status') || null;
    const langFilter = searchParams.get('lang') || null;

    let allItems: ContentItem[] = Array.from(allPagesMap.values());

    // Apply filters
    if (titleFilter) {
      allItems = allItems.filter(item => item.title.toLowerCase().includes(titleFilter.toLowerCase()));
    }
    if (statusFilter) {
      allItems = allItems.filter(item => item.status === statusFilter);
    }
    if (langFilter) {
       allItems = allItems.filter(item => item.lang === langFilter);
    }

    const mainLanguageItems = allItems.filter(item => {
        const lang = item.lang || 'es';
        const translations = item.translations || {};
        const firstTranslationId = Object.values(translations)[0];
        // It's a main language post if its ID is the value for its own language,
        // or if it doesn't have a lang defined but is the first in its translation group.
        return translations[lang] === item.id || (!item.lang && firstTranslationId === item.id);
    });

    const totalItems = mainLanguageItems.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const paginatedMainItems = mainLanguageItems.slice((page - 1) * perPage, page * perPage);

    const finalHierarchicalData: HierarchicalContentItem[] = paginatedMainItems.map(mainItem => {
        const subRows = Object.values(mainItem.translations || {})
            .filter(translationId => translationId !== mainItem.id)
            .map(translationId => allPagesMap.get(translationId))
            .filter((item): item is ContentItem => !!item);
        
        return {
            ...mainItem,
            subRows: subRows
        };
    });

    return NextResponse.json({ 
        pages: finalHierarchicalData,
        totalPages: totalPages,
        totalItems: totalItems,
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch pages.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    console.error("Critical error in pages search API:", error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
