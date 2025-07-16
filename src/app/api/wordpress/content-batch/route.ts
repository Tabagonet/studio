// This is a new file for fetching batch content data.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import axios from 'axios';
import * as cheerio from 'cheerio';

export const dynamic = 'force-dynamic';

async function fetchPostData(id: number, type: string, wpApi: any, wooApi: any) {
    let post;
    const isProduct = type.toLowerCase() === 'producto';
    const endpoint = isProduct ? `products/${id}` : (type.toLowerCase() === 'page' ? `pages/${id}` : `posts/${id}`);
    const api = isProduct ? wooApi : wpApi;

    const { data } = await api.get(endpoint, { params: { context: 'view' } });
    post = data;

    const pageLink = post.permalink || post.link;
    let scrapedImages: any[] = [];
    if (pageLink && wpApi) {
        try {
            const scrapeResponse = await axios.get(pageLink, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = scrapeResponse.data;
            const $ = cheerio.load(html);
            const $contentArea = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
            $contentArea.find('header, footer, nav').remove();

            const foundImageIds = new Set<number>();
            $contentArea.find('img').each((i, el) => {
                const classList = $(el).attr('class') || '';
                const match = classList.match(/wp-image-(\d+)/);
                const mediaId = match ? parseInt(match[1], 10) : null;
                if (mediaId) foundImageIds.add(mediaId);
            });

            if (foundImageIds.size > 0) {
                 const mediaResponse = await wpApi.get('/media', {
                    params: { include: Array.from(foundImageIds).join(','), per_page: 100, _fields: 'id,alt_text,source_url' }
                });
                if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                     scrapedImages = mediaResponse.data.map((item: any) => ({
                        id: item.source_url, src: item.source_url, alt: item.alt_text || '', mediaId: item.id,
                    }));
                }
            }
        } catch (scrapeError) {
            console.warn(`Could not scrape ${pageLink} for live image data:`, scrapeError);
        }
    }

    return {
        id: post.id,
        title: post.name || post.title.rendered,
        images: scrapedImages
    };
}


export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        const uid = (await adminAuth.verifyIdToken(token)).uid;
        
        const { wpApi, wooApi } = await getApiClientsForUser(uid);
        if (!wpApi || !wooApi) throw new Error('API clients not configured');

        const { searchParams } = new URL(req.url);
        const ids = searchParams.get('ids')?.split(',').map(Number).filter(Boolean);
        const type = searchParams.get('type');

        if (!ids || ids.length === 0 || !type) {
            return NextResponse.json({ error: 'IDs and type are required' }, { status: 400 });
        }

        const promises = ids.map(id => fetchPostData(id, type, wpApi, wooApi));
        const content = await Promise.all(promises);
        
        return NextResponse.json({ content });

    } catch (error: any) {
        console.error("Error fetching batch content:", error);
        return NextResponse.json({ error: 'Failed to fetch content', details: error.message }, { status: 500 });
    }
}
