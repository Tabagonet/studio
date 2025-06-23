
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { BlogPostSearchResult } from '@/lib/types';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { wpApi } = await getApiClientsForUser(uid);
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('per_page') || '10';
    const category = searchParams.get('category');
    const status = searchParams.get('status');
    const orderby = searchParams.get('orderby') || 'date';
    const order = searchParams.get('order') || 'desc';

    const params: any = {
      per_page: parseInt(perPage, 10),
      page: parseInt(page, 10),
      orderby,
      order,
      _embed: true, // Crucial for getting author name and featured image URL
    };
    
    if (query) params.search = query;
    if (status && status !== 'all') params.status = status;
    if (category && category !== 'all') params.categories = [category];

    const response = await wpApi.get("posts", { params });
    
    const posts: BlogPostSearchResult[] = response.data.map((post: any) => ({
        id: post.id,
        title: post.title.rendered,
        link: post.link,
        status: post.status,
        date_created: post.date,
        author_name: post._embedded?.author?.[0]?.name || 'Desconocido',
        featured_image_url: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
        categories: post._embedded?.['wp:term']?.[0]?.map((cat: any) => ({ id: cat.id, name: cat.name })) || [],
        tags: post._embedded?.['wp:term']?.[1]?.map((tag: any) => ({ id: tag.id, name: tag.name })) || [],
    }));

    const totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages'], 10) : 1;
        
    return NextResponse.json({ posts, totalPages });
  } catch (error: any) {
    console.error('Error searching WordPress posts:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to search posts.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
