// This is a new file for fetching batch content data.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, findElementorImageContext } from '@/lib/api-helpers';
import axios from 'axios';
import * as cheerio from 'cheerio';


export const dynamic = 'force-dynamic';

async function fetchPostData(id: number, type: string, wpApi: any, wooApi: any) {
    let post;
    const isProduct = type.toLowerCase() === 'producto';
    const endpoint = isProduct ? `products/${id}` : (type.toLowerCase() === 'page' ? `pages/${id}` : `posts/${id}`);
    const apiToUse = isProduct ? wooApi : wpApi;

    if (!apiToUse) {
        throw new Error(`API client for type "${type}" is not configured.`);
    }

    const { data } = await apiToUse.get(endpoint, { params: { context: 'edit' } });
    post = data;

    const metaToCheck = post.meta_data ? post.meta_data.reduce((obj: any, item: any) => ({...obj, [item.key]: item.value}), {}) : post.meta;
    
    // 1. Get images from Elementor JSON data if it exists
    let elementorImages: any[] = [];
    if (metaToCheck?._elementor_data) {
        try {
            const elementorData = JSON.parse(metaToCheck._elementor_data);
            elementorImages = findElementorImageContext(elementorData);
        } catch (e) {
            console.warn(`Could not parse Elementor data for post ${id}`);
        }
    }
    
    // 2. Get images by scraping the live URL to capture everything rendered in HTML
    let scrapedImages: any[] = [];
    const pageLink = post.permalink || post.link;
    if (pageLink && wpApi) {
        try {
            const scrapeResponse = await axios.get(pageLink, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const html = scrapeResponse.data;
            const $ = cheerio.load(html);
            const $contentArea = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
            $contentArea.find('header, footer, nav, script, style, noscript').remove();

            const imageMap = new Map<string, any>();

            $contentArea.find('img').each((i, el) => {
                const src = $(el).attr('data-src') || $(el).attr('src');
                if (!src || src.includes('data:image')) return;

                const absoluteSrc = new URL(src, pageLink).href;
                if (!imageMap.has(absoluteSrc)) {
                    const classList = $(el).attr('class') || '';
                    const match = classList.match(/wp-image-(\d+)/);
                    const mediaId = match ? parseInt(match[1], 10) : null;
                    
                    imageMap.set(absoluteSrc, {
                        id: absoluteSrc, src: absoluteSrc, alt: $(el).attr('alt') || '', mediaId: mediaId,
                        width: $(el).attr('width') || null, height: $(el).attr('height') || null
                    });
                }
            });
            scrapedImages = Array.from(imageMap.values());
        } catch (scrapeError) {
            console.warn(`Could not scrape ${pageLink} for live image data:`, scrapeError);
        }
    }

    // 3. Merge and de-duplicate results with improved logic
    const finalImageMap = new Map<string, any>();
    
    // First, process images found via scraping, as they contain the final rendered dimensions and alt text.
    scrapedImages.forEach(img => {
        finalImageMap.set(img.src, {
            id: img.src,
            src: img.src,
            alt: img.alt,
            mediaId: img.mediaId,
            width: img.width,
            height: img.height,
            context: 'Contenido HTML',
            widgetType: 'image',
        });
    });

    // Now, iterate through Elementor images to enrich the map with context and potentially missing media IDs.
    elementorImages.forEach(img => {
      if (finalImageMap.has(img.url)) {
        // If image exists, enrich it with Elementor-specific data
        const existingImg = finalImageMap.get(img.url);
        existingImg.context = img.context || existingImg.context;
        existingImg.widgetType = img.widgetType || existingImg.widgetType;
        existingImg.mediaId = existingImg.mediaId || img.id;
        existingImg.width = existingImg.width || img.width;
        existingImg.height = existingImg.height || img.height;
      } else {
        // If it's a new image found only in Elementor JSON, add it
        finalImageMap.set(img.url, {
            id: img.url,
            src: img.url,
            alt: '', // Alt text not available in Elementor JSON
            mediaId: img.id,
            width: img.width,
            height: img.height,
            context: img.context,
            widgetType: img.widgetType,
        });
      }
    });


    return {
        id: post.id,
        title: post.name || post.title.rendered,
        images: Array.from(finalImageMap.values())
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
