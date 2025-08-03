

// src/app/api/wordpress/content-list/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
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
    link: item.permalink || item.link || null, // Ensure null instead of undefined
    status: item.status || 'publish', // Categories don't have a status
    parent: item.parent || 0,
    lang: item.lang || null,
    translations: item.translations || {},
    modified: item.modified || item.date_created || null, // Fallback to date_created, then null
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
                    lang: '', // Fetch all languages
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
            link: cat.link || null,
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
      throw new Error('WordPress API is not configured for the active connection.');
    }
    
    const { searchParams } = new URL(req.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const cacheRef = adminDb.collection('content_cache').doc(uid);

    // Try to get from cache first
    if (!forceRefresh) {
        const cacheDoc = await cacheRef.get();
        if (cacheDoc.exists) {
            const cacheData = cacheDoc.data();
            const lastUpdated = cacheData?.timestamp?.toDate();
            // Cache is valid for 10 minutes
            if (lastUpdated && (new Date().getTime() - lastUpdated.getTime()) < 10 * 60 * 1000) {
                return NextResponse.json(cacheData?.data);
            }
        }
    }

    // --- If no valid cache, fetch from source ---
    const frontPageId = await wpApi.get('/options').then(res => res.data.page_on_front).catch(() => 0);
    
    const [pages, posts, products, postCategories, productCategories] = await Promise.all([
        fetchAllOfType(wpApi, 'pages', 'Page', frontPageId),
        fetchAllOfType(wpApi, 'posts', 'Post', frontPageId),
        fetchAllOfType(wooApi, 'products', 'Producto', frontPageId),
        fetchAllCategories(wpApi, 'categories', 'Categoría de Entradas', wpApi),
        fetchAllCategories(wooApi, 'products/categories', 'Categoría de Productos', wpApi),
    ]);
    
    let allContent = [...pages, ...posts, ...products, ...postCategories, ...productCategories];
    
    // Server-side Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const perPage = parseInt(searchParams.get('per_page') || '20', 10);
    const totalItems = allContent.length;
    const totalPages = Math.ceil(totalItems / perPage);
    const paginatedContent = allContent.slice((page - 1) * perPage, page * perPage);

    const responsePayload = { 
        content: paginatedContent,
        total: totalItems,
        totalPages: totalPages,
    };
    
    // Save the full, unpaginated data to cache
    await cacheRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      data: {
        content: allContent, // Cache all content
        total: totalItems,
        totalPages: Math.ceil(totalItems / 20) // Assuming default page size for cache consistency
      }
    });

    return NextResponse.json(responsePayload);

  } catch (error: any) {
    console.error(`[API /content-list] Critical error:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
