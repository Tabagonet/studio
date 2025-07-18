
// This is a new file for fetching batch content data.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, findElementorImageContext } from '@/lib/api-helpers';
import axios from 'axios';
import * as cheerio from 'cheerio';
import type { ExtractedWidget } from '@/lib/types';


export const dynamic = 'force-dynamic';

function findImageUrlsInElementor(data: any): { url: string; id: number | null, width: number | null, height: number | null }[] {
    const images: { url: string; id: number | null, width: number | null, height: number | null }[] = [];
    if (!data) return images;

    if (Array.isArray(data)) {
        data.forEach(item => images.push(...findImageUrlsInElementor(item)));
        return images;
    }

    if (typeof data === 'object') {
        for (const key in data) {
            // Standard image widgets, background images, etc.
            if (key === 'background_image' || key === 'image') {
                const value = data[key];
                 if (typeof value === 'object' && value !== null && typeof value.url === 'string' && value.url) {
                    const width = value.width || value.size?.width || null;
                    const height = value.height || value.size?.height || null;
                    images.push({ url: value.url, id: value.id || null, width, height });
                 }
            }
            // Sliders, galleries, and other repeater widgets
            else if (key === 'slides' && Array.isArray(data[key])) {
                data[key].forEach((slide: any) => {
                     if (slide.background_image?.url) {
                         const width = slide.background_image.width || slide.background_image.size?.width || null;
                         const height = slide.background_image.height || slide.background_image.size?.height || null;
                         images.push({ url: slide.background_image.url, id: slide.background_image.id || null, width, height });
                     }
                      if (slide.image?.url) {
                         const width = slide.image.width || slide.image.size?.width || null;
                         const height = slide.image.height || slide.image.size?.height || null;
                         images.push({ url: slide.image.url, id: slide.image.id || null, width, height });
                     }
                });
            }
            else if (typeof data[key] === 'object' && data[key] !== null) {
                images.push(...findImageUrlsInElementor(data[key]));
            }
        }
    }
    return images;
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
    const metaToCheck = post.meta_data ? post.meta_data.reduce((obj: any, item: any) => ({...obj, [item.key]: item.value}), {}) : post.meta;
    const isElementor = !!metaToCheck?._elementor_data;

    if (isElementor) {
        const elementorData = JSON.parse(metaToCheck._elementor_data || '[]');
        const imageUrlsData = findImageUrlsInElementor(elementorData);
        
        if (imageUrlsData.length > 0) {
            scrapedImages = imageUrlsData.map(imgData => ({
                id: imgData.url, // Use url as unique key for frontend
                src: imgData.url,
                alt: '', // Will be fetched if media id is available
                mediaId: imgData.id,
                width: imgData.width,
                height: imgData.height,
            }));

            const mediaIdsToFetch = imageUrlsData.map(img => img.id).filter((id): id is number => id !== null);
            if (mediaIdsToFetch.length > 0) {
                try {
                    const mediaResponse = await wpApi.get('/media', {
                        params: { include: [...new Set(mediaIdsToFetch)].join(','), per_page: 100, _fields: 'id,alt_text,source_url,media_details' }
                    });
                    if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                        const mediaDataMap = new Map<number, any>();
                        mediaResponse.data.forEach((mediaItem: any) => {
                            mediaDataMap.set(mediaItem.id, mediaItem);
                        });
                        scrapedImages.forEach(img => {
                            if (img.mediaId && mediaDataMap.has(img.mediaId)) {
                                const mediaItem = mediaDataMap.get(img.mediaId);
                                img.alt = mediaItem.alt_text || '';
                                img.width = img.width || mediaItem.media_details?.width || null;
                                img.height = img.height || mediaItem.media_details?.height || null;
                            }
                        });
                    }
                } catch (mediaError) {
                    console.warn(`Could not fetch media details for some Elementor images:`, mediaError);
                }
            }
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
                        params: { include: Array.from(foundImageIds).join(','), per_page: 100, _fields: 'id,alt_text,source_url,media_details' }
                    });
                    if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                         scrapedImages = mediaResponse.data.map((item: any) => ({
                            id: item.source_url, src: item.source_url, alt: item.alt_text || '', mediaId: item.id,
                            width: item.media_details?.width || null,
                            height: item.media_details?.height || null,
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
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
        
        const { wpApi, wooApi } = await getApiClientsForUser(uid);
        if (!wpApi) throw new Error('WordPress API client not configured');

        const { searchParams } = new URL(req.url);
        const idsString = searchParams.get('ids');
        const type = searchParams.get('type');

        if (!idsString || !type) {
            return NextResponse.json({ error: 'IDs and type are required' }, { status: 400 });
        }
        
        const ids = idsString.split(',').map(Number).filter(Boolean);
        if (ids.length === 0) {
             return NextResponse.json({ error: 'No valid IDs provided' }, { status: 400 });
        }


        const promises = ids.map(id => fetchPostData(id, type, wpApi, wooApi));
        const content = await Promise.all(promises);
        
        return NextResponse.json({ content });

    } catch (error: any) {
        console.error("Error fetching batch content:", error);
        return NextResponse.json({ error: 'Failed to fetch content', details: error.message }, { status: 500 });
    }
}
