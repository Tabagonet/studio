
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { ProductSearchResult } from '@/lib/types';
import { adminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const include = searchParams.get('include');
    const page = searchParams.get('page') || '1';
    const perPage = searchParams.get('per_page') || '10';
    const category = searchParams.get('category');
    const type = searchParams.get('type');
    const status = searchParams.get('status');
    const stock_status = searchParams.get('stock_status');
    const orderby = searchParams.get('orderby') || 'date';
    const order = searchParams.get('order') || 'desc';
    const lang = searchParams.get('lang');
    const hasImage = searchParams.get('has_image'); // yes or no

    let params: any = {
      orderby,
      order,
    };

    if (include) {
      params.include = include.split(',').map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      params.per_page = 100;
    } else {
      if (query) params.search = query;
      if (type && type !== 'all') params.type = type;
      if (category && category !== 'all') params.category = category;
      if (status && status !== 'all') params.status = status;
      if (lang && lang !== 'all') params.lang = lang;
      if (stock_status && stock_status !== 'all') params.stock_status = stock_status;
    }

    let allProducts: any[] = [];
    let totalPages = 1;
    const pageNum = parseInt(page, 10);
    const perPageNum = parseInt(perPage, 10);

    if (hasImage === 'yes' || hasImage === 'no') {
        // Fetch all products matching other criteria, then filter by image and paginate manually.
        params.per_page = 100;
        let currentPage = 1;
        let morePages = true;
        while(morePages) {
            params.page = currentPage;
            const response = await wooApi.get("products", params);
            allProducts = allProducts.concat(response.data);
            const totalPagesHeader = response.headers['x-wp-totalpages'];
            morePages = totalPagesHeader ? currentPage < parseInt(totalPagesHeader, 10) : false;
            currentPage++;
        }
        
        const filteredProducts = allProducts.filter((p: any) => {
             const imageExists = p.images && p.images.length > 0 && p.images[0].src && !p.images[0].src.includes('placeholder');
             return hasImage === 'yes' ? imageExists : !imageExists;
        });

        totalPages = Math.ceil(filteredProducts.length / perPageNum);
        const paginatedData = filteredProducts.slice((pageNum - 1) * perPageNum, pageNum * perPageNum);
        allProducts = paginatedData;

    } else {
        // Standard pagination
        params.page = pageNum;
        params.per_page = perPageNum;
        const response = await wooApi.get("products", params);
        allProducts = response.data;
        totalPages = response.headers['x-wp-totalpages'] ? parseInt(response.headers['x-wp-totalpages'], 10) : 1;
    }


    const products: ProductSearchResult[] = allProducts.map((product: any) => {
        let imageUrl: string | null = null;
        
        if (product.images && product.images.length > 0 && product.images[0].src) {
            imageUrl = product.images[0].src;
        } 
        else if (product.image) {
            if (typeof product.image === 'object' && product.image.src) {
                imageUrl = product.image.src;
            } 
            else if (typeof product.image === 'string') {
                imageUrl = product.image;
            }
        }

        return {
            id: product.id,
            name: product.name,
            price: product.price,
            regular_price: product.regular_price || '',
            sale_price: product.sale_price || '',
            image: imageUrl,
            sku: product.sku,
            type: product.type,
            status: product.status,
            stock_status: product.stock_status,
            categories: product.categories.map((c: any) => ({ id: c.id, name: c.name })),
            date_created: product.date_created,
            permalink: product.permalink,
            lang: product.lang || null,
            translations: product.translations || {},
            manage_stock: product.manage_stock,
            stock_quantity: product.stock_quantity,
            weight: product.weight,
            dimensions: product.dimensions,
            shipping_class: product.shipping_class,
        };
    });
        
    return NextResponse.json({ products, totalPages });
  } catch (error: any) {
    console.error('Error searching WooCommerce products:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to search products.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
