

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, extractElementorWidgets, replaceElementorTexts, findImageUrlsInElementor, findBeaverBuilderImages } from '@/lib/api-helpers';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

const pageUpdateSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    elementorWidgets: z.array(z.object({
        id: z.string(),
        text: z.string(),
    })).optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private', 'future']).optional(),
    author: z.number().optional().nullable(),
    featured_media: z.number().optional().nullable(),
    featured_image_src: z.string().url().optional(),
    meta: z.object({
        _yoast_wpseo_title: z.string().optional(),
        _yoast_wpseo_metadesc: z.string().optional(),
        _yoast_wpseo_focuskw: z.string().optional(),
        _elementor_data: z.string().optional(), // Allow passing full elementor data
    }).optional(),
    featured_image_metadata: z.object({
        title: z.string(),
        alt_text: z.string(),
    }).optional(),
    image_alt_updates: z.array(z.object({
        id: z.number(),
        alt: z.string(),
    })).optional(),
});


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const pageId = params.id;
    if (!pageId) return NextResponse.json({ error: 'Page ID is required.' }, { status: 400 });

    const response = await wpApi.get(`/pages/${pageId}`, { params: { _embed: true, context: 'edit' } });
    
    const pageData = response.data;
    
    const metaToCheck = pageData.meta_data ? pageData.meta_data.reduce((obj: any, item: any) => ({...obj, [item.key]: item.value}), {}) : pageData.meta;
    const isElementor = !!metaToCheck?._elementor_data;
    const isBeBuilder = !!metaToCheck?.mfn_builder_items;
    
    let finalContent;
    if (isElementor) {
        finalContent = extractElementorWidgets(pageData.meta._elementor_data);
    } else {
        finalContent = pageData.content?.rendered || '';
    }
    
    let scrapedImages: any[] = [];
    
    if (isElementor) {
        const elementorData = JSON.parse(pageData.meta._elementor_data || '[]');
        const imageUrlsData = findImageUrlsInElementor(elementorData);
        if (imageUrlsData.length > 0) {
            scrapedImages = imageUrlsData.map(imgData => ({
                id: imgData.url,
                src: imgData.url,
                alt: '', 
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
    } else if (isBeBuilder) {
        const beBuilderData = JSON.parse(metaToCheck.mfn_builder_items || '[]');
        const imageUrlsData = findBeaverBuilderImages(beBuilderData);
         if (imageUrlsData.length > 0) {
            scrapedImages = imageUrlsData.map(imgData => ({
                id: imgData.url,
                src: imgData.url,
                alt: '',
                mediaId: null, // BeBuilder often doesn't store media ID in its JSON structure.
                width: null,
                height: null,
            }));
        }
    }
    else { 
        const pageLink = pageData.link;
        if (pageLink && wpApi) {
            try {
                const scrapeResponse = await axios.get(pageLink, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 'Cache-Control': 'no-cache' } });
                const html = scrapeResponse.data;
                const $ = cheerio.load(html);
                
                const $contentArea = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
                $contentArea.find('header, footer, nav').remove();

                const foundImageIds = new Set<number>();

                $contentArea.find('img').each((i, el) => {
                    const classList = $(el).attr('class') || '';
                    const match = classList.match(/wp-image-(\d+)/);
                    const mediaId = match ? parseInt(match[1], 10) : null;
                    if (mediaId) {
                        foundImageIds.add(mediaId);
                    }
                });
                
                if (foundImageIds.size > 0) {
                     const mediaResponse = await wpApi.get('/media', {
                        params: { include: Array.from(foundImageIds).join(','), per_page: 100, _fields: 'id,alt_text,source_url,media_details' }
                    });

                    if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                         scrapedImages = mediaResponse.data.map((mediaItem: any) => ({
                            id: mediaItem.source_url, 
                            src: mediaItem.source_url,
                            alt: mediaItem.alt_text || '',
                            mediaId: mediaItem.id,
                            width: mediaItem.media_details?.width || null,
                            height: mediaItem.media_details?.height || null,
                        }));
                    }
                }
            } catch (scrapeError) {
                console.warn(`Could not scrape ${pageLink} for live image data:`, scrapeError);
            }
        }
    }


    const adminUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '/wp-admin/');
    const elementorEditLink = isElementor ? `${adminUrl}post.php?post=${pageId}&action=elementor` : null;
    const adminEditLink = `${adminUrl}post.php?post=${pageId}&action=edit`;

    const transformed = {
      ...pageData,
      content: { ...pageData.content, rendered: finalContent },
      featured_image_url: pageData._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      featured_media: pageData.featured_media,
      isElementor,
      elementorEditLink,
      adminEditLink,
      scrapedImages,
    };
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error(`Error fetching page ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch page details.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const pageId = Number(params.id);
    if (!pageId) return NextResponse.json({ error: 'Page ID is required.' }, { status: 400 });

    const body = await req.json();
    const validation = pageUpdateSchema.safeParse(body);
    if (!validation.success) return NextResponse.json({ error: 'Invalid data.', details: validation.error.flatten() }, { status: 400 });
    
    const { featured_image_src, featured_image_metadata, image_alt_updates, elementorWidgets, ...pagePayload } = validation.data;
    
    if (featured_image_src) {
        const seoFilename = `${slugify(pagePayload.title || 'page')}-${pageId}.jpg`;
        (pagePayload as any).featured_media = await uploadImageToWordPress(
            featured_image_src,
            seoFilename,
            {
                title: pagePayload.title || 'Page Image',
                alt_text: pagePayload.title || '',
                caption: '',
                description: typeof pagePayload.content === 'string' ? pagePayload.content.substring(0, 100) : '',
            },
            wpApi
        );
    }
    
    if (elementorWidgets) {
        const { data: currentPageData } = await wpApi.get(`/pages/${pageId}`, { params: { context: 'edit' } });
        const currentElementorData = JSON.parse(currentPageData.meta?._elementor_data || '[]');
        
        let newElementorData = JSON.parse(JSON.stringify(currentElementorData));
        for (const widgetUpdate of elementorWidgets) {
            newElementorData = replaceElementorTexts(newElementorData, {
                [widgetUpdate.id]: widgetUpdate.text,
                clear: function (): void {
                    throw new Error('Function not implemented.');
                },
                delete: function (key: string): boolean {
                    throw new Error('Function not implemented.');
                },
                forEach: function (callbackfn: (value: string, key: string, map: Map<string, string>) => void, thisArg?: any): void {
                    throw new Error('Function not implemented.');
                },
                get: function (key: string): string | undefined {
                    throw new Error('Function not implemented.');
                },
                has: function (key: string): boolean {
                    throw new Error('Function not implemented.');
                },
                set: function (key: string, value: string): Map<string, string> {
                    throw new Error('Function not implemented.');
                },
                size: 0,
                entries: function (): MapIterator<[string, string]> {
                    throw new Error('Function not implemented.');
                },
                keys: function (): MapIterator<string> {
                    throw new Error('Function not implemented.');
                },
                values: function (): MapIterator<string> {
                    throw new Error('Function not implemented.');
                },
                [Symbol.iterator]: function (): MapIterator<[string, string]> {
                    throw new Error('Function not implemented.');
                },
                [Symbol.toStringTag]: ''
            });
        }
        (pagePayload as any).meta = { ...(pagePayload.meta || {}), _elementor_data: JSON.stringify(newElementorData) };
    }
    
    const response = await wpApi.post(`/pages/${pageId}`, pagePayload);
    
    if (featured_image_metadata && response.data.featured_media) {
        try {
            await wpApi.post(`/media/${response.data.featured_media}`, {
                title: featured_image_metadata.title,
                alt_text: featured_image_metadata.alt_text,
            });
        } catch (mediaError: any) {
            console.warn(`Page updated, but failed to update featured image metadata for media ID ${response.data.featured_media}:`, mediaError.response?.data?.message || mediaError.message);
        }
    }
    
    if (image_alt_updates && image_alt_updates.length > 0) {
        for (const update of image_alt_updates) {
            try {
                if (update.id) {
                     await wpApi.post(`/media/${update.id}`, {
                        alt_text: update.alt
                    });
                }
            } catch (mediaError: any) {
                console.warn(`Failed to update alt text for media ID ${update.id}:`, mediaError.response?.data?.message || mediaError.message);
            }
        }
    }
    
    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error updating page ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update page.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const postId = params.id;
    if (!postId) return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });

    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/trash-post/${postId}`;
    const response = await wpApi.post(customEndpointUrl);
    
    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error deleting post ${params.id}:`, error.response?.data || error.message);
    let errorMessage = error.response?.data?.message || 'Failed to move post to trash.';
    if (error.response?.status === 404) {
      errorMessage = 'Endpoint de borrado no encontrado. Asegúrate de que el plugin personalizado está activo y actualizado en WordPress.';
    }
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
