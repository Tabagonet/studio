

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags } from '@/lib/api-helpers';
import { z } from 'zod';
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
    imageMetas: z.array(z.object({
        src: z.string(),
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
    const isElementor = !!postData.meta?._elementor_version;
    const adminUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '/wp-admin/');
    const elementorEditLink = isElementor ? `${adminUrl}post.php?post=${postId}&action=elementor` : null;
    const adminEditLink = `${adminUrl}post.php?post=${postId}&action=edit`;


    const transformed = {
      ...postData,
      featured_image_url: postData._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      featured_media: postData.featured_media,
      isElementor,
      elementorEditLink,
      adminEditLink,
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
    
    const { tags, featured_image_src, featured_image_metadata, imageMetas, ...postPayload } = validation.data;
    
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
    
    if (imageMetas && pagePayload.content) {
        const $ = cheerio.load(pagePayload.content, null, false); // { decodeEntities: false } -> null, false
        imageMetas.forEach(meta => {
            $(`img[src="${meta.src}"]`).attr('alt', meta.alt);
        });
        pagePayload.content = $('body').html() || $.html(); // Prefer body's inner HTML to avoid extra tags
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
