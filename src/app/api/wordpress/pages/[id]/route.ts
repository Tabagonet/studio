
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/api-helpers';
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
    featured_media_id: z.number().optional().nullable(),
    featured_image_src: z.string().url().optional(),
    metaDescription: z.string().optional(),
    focusKeyword: z.string().optional(),
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
    const isElementor = !!pageData.meta?._elementor_version;
    const adminUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '/wp-admin/');
    const elementorEditLink = isElementor ? `${adminUrl}post.php?post=${pageId}&action=elementor` : null;

    const transformed = {
      ...pageData,
      featured_image_url: pageData._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
      isElementor,
      elementorEditLink,
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

    const pageId = params.id;
    if (!pageId) return NextResponse.json({ error: 'Page ID is required.' }, { status: 400 });

    const body = await req.json();
    const validation = pageUpdateSchema.safeParse(body);
    if (!validation.success) return NextResponse.json({ error: 'Invalid data.', details: validation.error.flatten() }, { status: 400 });
    
    const { featured_image_src, metaDescription, focusKeyword, ...pagePayload } = validation.data;
    
    if (featured_image_src) {
        const seoFilename = `${slugify(pagePayload.title || 'page')}-${pageId}.jpg`;
        (pagePayload as any).featured_media = await uploadImageToWordPress(featured_image_src, seoFilename, {
            title: pagePayload.title || 'Page Image',
            alt_text: pagePayload.title || '',
            caption: '',
            description: pagePayload.content?.substring(0, 100) || '',
        }, wpApi);
    } else if (pagePayload.featured_media_id !== undefined) {
        // Handle setting an existing image or removing it (ID of 0 removes it)
        (pagePayload as any).featured_media = pagePayload.featured_media_id;
    }
    
    const meta: { [key: string]: string | undefined } = {};
    if (metaDescription !== undefined) {
        meta._yoast_wpseo_metadesc = metaDescription;
    }
    if (focusKeyword !== undefined) {
        meta._yoast_wpseo_focuskw = focusKeyword;
    }
    if (Object.keys(meta).length > 0) {
        (pagePayload as any).meta = meta;
    }

    // WordPress API uses POST for updates to an existing ID
    const response = await wpApi.post(`/pages/${pageId}`, pagePayload);
    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error updating page ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update page.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
