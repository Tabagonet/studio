

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, extractElementorHeadings } from '@/lib/api-helpers';
import { z } from 'zod';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

const pageUpdateSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private', 'future']).optional(),
    author: z.number().optional().nullable(),
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

    const pageId = params.id;
    if (!pageId) return NextResponse.json({ error: 'Page ID is required.' }, { status: 400 });

    const response = await wpApi.get(`/pages/${pageId}`, { params: { _embed: true, context: 'edit' } });
    
    const pageData = response.data;
    
    const contentIsJsonArray = (pageData.content?.rendered || '').trim().startsWith('[');
    const isElementor = !!pageData.meta?._elementor_version || contentIsJsonArray;
    
    let finalContent;
    if (isElementor && pageData.meta?._elementor_data) {
        finalContent = extractElementorHeadings(pageData.meta._elementor_data);
    } else {
        finalContent = pageData.content?.rendered || '';
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
    
    const { featured_image_src, featured_image_metadata, image_alt_updates, ...pagePayload } = validation.data;
    
    if (featured_image_src) {
        const seoFilename = `${slugify(pagePayload.title || 'page')}-${pageId}.jpg`;
        (pagePayload as any).featured_media = await uploadImageToWordPress(featured_image_src, seoFilename, {
            title: pagePayload.title || 'Page Image',
            alt_text: pagePayload.title || '',
            caption: '',
            description: pagePayload.content?.substring(0, 100) || '',
        }, wpApi);
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
                await wpApi.post(`/media/${update.id}`, {
                    alt_text: update.alt
                });
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

