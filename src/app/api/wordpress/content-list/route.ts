

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ContentItem } from '@/lib/types';


export const dynamic = 'force-dynamic';

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
    
    const { wpApi } = await getApiClientsForUser(uid);
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


    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    const customEndpointUrl = new URL(`${siteUrl}/wp-json/custom/v1/content-list`);
    
    // Fetch all content from the custom endpoint
    const response = await wpApi.get(customEndpointUrl.toString());
    let allContent: ContentItem[] = response.data.content || [];

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
    
    // --- Server-side Pagination ---
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
    let errorMessage = 'Failed to fetch content list.';
    let status = error.response?.status || 500;

    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    if (error.response?.status === 404) {
      errorMessage = 'Endpoint /custom/v1/content-list no encontrado. Por favor, actualiza el plugin "AutoPress AI Helper" en tu WordPress a la última versión.';
    }
    
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

// Helper function to ensure we have a number, equivalent to PHP's absint
function absint(value: string | number): number {
  return Math.abs(parseInt(String(value), 10));
}

