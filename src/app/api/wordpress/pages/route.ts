
// src/app/api/wordpress/pages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';
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
        return NextResponse.json({ pages: [], totalPages: 0 });
    }
    
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);

    let allFrontPageIds = new Set<number>();
    try {
        const settingsRes = await wpApi.get('/settings');
        const frontPageId = settingsRes.data?.page_on_front;
        if (frontPageId) {
            allFrontPageIds.add(frontPageId);
            if (typeof (wpApi as any).pll_get_post_translations === 'function') {
                const translations = await (wpApi as any).pll_get_post_translations(frontPageId);
                Object.values(translations).forEach(id => allFrontPageIds.add(id as number));
            }
        }
    } catch(e) {
        console.warn("Could not retrieve site settings to determine front page.");
    }
    
    const response = await wpApi.get('pages', {
      params: {
        per_page: perPage,
        page: page,
        context: 'view',
        _embed: false,
        lang: '', // Fetch all languages
        status: 'publish,future,draft,pending,private,trash'
      }
    });

    const pages: ContentItem[] = response.data.map((page: any) => transformPageToContentItem(page, allFrontPageIds));
    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1', 10);
    
    return NextResponse.json({ 
        pages: pages,
        totalPages: totalPages,
    });

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch pages.';
    const status = error.message?.includes('not configured') ? 400 : (error.response?.status || 500);
    console.error("Critical error in pages API:", error);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
