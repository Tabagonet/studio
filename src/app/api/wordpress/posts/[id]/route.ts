

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags, extractElementorWidgets } from '@/lib/api-helpers';
import { z } from 'zod';
import axios from 'axios';
import * as cheerio from 'cheerio';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

const postUpdateSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private', 'future']).optional(),
    author: z.number().optional().nullable(),
    categories: z.array(z.number()).optional(),
    tags: z.string().optional(),
    featured_media: z.number().optional().nullable(),
    featured_image_src: z.string().url().optional(),
    meta: z.object({
        _yoast_wpseo_title: z.string().optional(),
        _yoast_wpseo_metadesc: z.string().optional(),
        _yoast_wpseo_focuskw: z.string().optional(),
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

    const postId = params.id;
    if (!postId) return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });

    const response = await wpApi.get(`/posts/${postId}`, { params: { _embed: true, context: 'edit' } });
    
    const postData = response.data;
    
    const contentIsJsonArray = (postData.content?.rendered || '').trim().startsWith('[');
    const isElementor = !!postData.meta?._elementor_version || contentIsJsonArray;

    const adminUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '/wp-admin/');
    const elementorEditLink = isElementor ? `${adminUrl}post.php?post=${postId}&action=elementor` : null;
    const adminEditLink = `${adminUrl}post.php?post=${postId}&action=edit`;

    let finalContent;
    if (isElementor && postData.meta?._elementor_data) {
        finalContent = extractElementorWidgets(postData.meta._elementor_data);
    } else {
        finalContent = postData.content?.rendered || '';
    }
    
    // --- New: Scrape live page for accurate image data ---
    const pageLink = postData.link;
    let scrapedImages: any[] = [];
    if (pageLink && wpApi) {
        try {
            const scrapeResponse = await axios.get(pageLink, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', 'Cache-Control': 'no-cache' } });
            const html = scrapeResponse.data;
            const $ = cheerio.load(html);
            
            const $contentArea = $('main').length ? $('main') : $('article').length ? $('article') : $('body');
            $contentArea.find('header, footer, nav').remove();

            const foundImageIds = new Set<number>();
            const imageMap = new Map<string, any>();

            $contentArea.find('img').each((i, el) => {
                const srcAttr = $(el).attr('data-src') || $(el).attr('src');
                if (!srcAttr) return;
                
                const classList = $(el).attr('class') || '';
                const match = classList.match(/wp-image-(\d+)/);
                const mediaId = match ? parseInt(match[1], 10) : null;
                if (mediaId) {
                    foundImageIds.add(mediaId);
                }

                const absoluteSrc = new URL(srcAttr, pageLink).href;
                if (!imageMap.has(absoluteSrc)) {
                    imageMap.set(absoluteSrc, {
                        id: absoluteSrc, 
                        src: absoluteSrc,
                        alt: $(el).attr('alt') || '',
                        mediaId: mediaId,
                        width: null,
                        height: null,
                    });
                }
            });
            
            if (foundImageIds.size > 0) {
                 const mediaResponse = await wpApi.get('/media', {
                    params: { include: Array.from(foundImageIds).join(','), per_page: 100, _fields: 'id,alt_text,source_url,media_details' }
                });

                if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                     mediaResponse.data.forEach((mediaItem: any) => {
                         const absoluteSrc = new URL(mediaItem.source_url, pageLink).href;
                        if (imageMap.has(absoluteSrc)) {
                            const img = imageMap.get(absoluteSrc);
                            img.alt = mediaItem.alt_text || img.alt;
                            img.mediaId = mediaItem.id;
                            img.width = mediaItem.media_details?.width || null;
                            img.height = mediaItem.media_details?.height || null;
                        } else {
                            imageMap.set(absoluteSrc, {
                                id: absoluteSrc,
                                src: absoluteSrc,
                                alt: mediaItem.alt_text || '',
                                mediaId: mediaItem.id,
                                width: mediaItem.media_details?.width || null,
                                height: mediaItem.media_details?.height || null,
                            });
                        }
                     });
                }
            }
            scrapedImages = Array.from(imageMap.values());
        } catch (scrapeError) {
            console.warn(`Could not scrape ${pageLink} for live image data:`, scrapeError);
        }
    }
    // --- End new logic ---

    const transformed = {
      ...postData,
      content: { ...postData.content, rendered: finalContent },
      featured_image_url: postData._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      featured_media: postData.featured_media,
      isElementor,
      elementorEditLink,
      adminEditLink,
      scrapedImages,
    };
    return NextResponse.json(transformed);
  } catch (error: any) {
    console.error(`Error fetching post ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch post details.';
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

    const postId = Number(params.id);
    if (!postId) return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });

    const body = await req.json();
    const validation = postUpdateSchema.safeParse(body);
    if (!validation.success) return NextResponse.json({ error: 'Invalid data.', details: validation.error.flatten() }, { status: 400 });
    
    const { tags, featured_image_src, featured_image_metadata, image_alt_updates, ...postPayload } = validation.data;
    
    if (tags !== undefined) {
        const tagNames = tags.split(',').map(t => t.trim()).filter(Boolean);
        (postPayload as any).tags = await findOrCreateTags(tagNames, wpApi);
    }
    
    if (featured_image_src) {
        const seoFilename = `${slugify(postPayload.title || 'blog-post')}-${postId}.jpg`;
        (postPayload as any).featured_media = await uploadImageToWordPress(featured_image_src, seoFilename, {
            title: postPayload.title || 'Blog Post Image',
            alt_text: postPayload.title || '',
            caption: '',
            description: postPayload.content?.substring(0, 100) || '',
        }, wpApi);
    }
    
    const response = await wpApi.post(`/posts/${postId}`, postPayload);
    
    if (featured_image_metadata && response.data.featured_media) {
        try {
            await wpApi.post(`/media/${response.data.featured_media}`, {
                title: featured_image_metadata.title,
                alt_text: featured_image_metadata.alt_text,
            });
        } catch (mediaError: any) {
            console.warn(`Post updated, but failed to update featured image metadata for media ID ${response.data.featured_media}:`, mediaError.response?.data?.message || mediaError.message);
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
    console.error(`Error updating post ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update post.';
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
