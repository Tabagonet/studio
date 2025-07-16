
// This is a new file for fetching batch content data.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, extractElementorHeadings } from '@/lib/api-helpers';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ExtractedWidget } from '@/lib/types';


export const dynamic = 'force-dynamic';

function findImageUrlsInElementor(data: any): string[] {
    const urls: string[] = [];
    if (!data) return urls;

    if (Array.isArray(data)) {
        data.forEach(item => urls.push(...findImageUrlsInElementor(item)));
        return urls;
    }

    if (typeof data === 'object') {
        for (const key in data) {
            if (key === 'url' && typeof data[key] === 'string' && (data[key].includes('.jpg') || data[key].includes('.jpeg') || data[key].includes('.png') || data[key].includes('.webp') || data[key].includes('.gif'))) {
                urls.push(data[key]);
            } else if (typeof data[key] === 'object' && data[key] !== null) {
                urls.push(...findImageUrlsInElementor(data[key]));
            }
        }
    }
    return urls;
}


async function fetchPostData(id: number, type: string, wpApi: any, wooApi: any) {
    let post;
    const isProduct = type.toLowerCase() === 'producto';
    const endpoint = isProduct ? `products/${id}` : (type.toLowerCase() === 'page' ? `pages/${id}` : `posts/${id}`);
    const api = isProduct ? wooApi : wpApi;

    if (!api) {
        throw new Error(`API client for type "${type}" is not configured.`);
    }

    const { data } = await api.get(endpoint, { params: { context: 'edit' } });
    post = data;

    let scrapedImages: any[] = [];
    const isElementor = !!post.meta?._elementor_data;

    if (isElementor) {
        const elementorData = JSON.parse(post.meta._elementor_data || '[]');
        const imageUrls = findImageUrlsInElementor(elementorData);
        if (imageUrls.length > 0) {
            const mediaItems = [];
            // To avoid making the request URL too long, fetch media in chunks of 50
            for (let i = 0; i < imageUrls.length; i += 50) {
                const chunk = imageUrls.slice(i, i + 50);
                try {
                     const mediaResponse = await wpApi.get('/media', {
                        params: { per_page: 50, search: chunk.map(url => new URL(url).pathname.split('/').pop()).join(' '), _fields: 'id,alt_text,source_url' }
                    });
                     if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                        mediaItems.push(...mediaResponse.data);
                    }
                } catch (mediaError) {
                    console.warn(`Could not fetch media details for some Elementor images:`, mediaError);
                }
            }
            
            scrapedImages = imageUrls.map(url => {
                 const mediaItem = mediaItems.find((m: any) => m.source_url === url);
                 return {
                    id: url,
                    src: url,
                    alt: mediaItem?.alt_text || '',
                    mediaId: mediaItem?.id || null
                 }
            })
        }

    } else { // Standard content scraping
        const pageLink = post.permalink || post.link;
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
