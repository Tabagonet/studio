
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags } from '@/lib/api-helpers';
import { z } from 'zod';
import axios from 'axios';

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
    tags: z.string().optional(), // Comma-separated string of tag names
    featured_media_id: z.number().optional(), // ID of an existing image
    featured_image_src: z.string().url().optional(), // URL of a new image to upload
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

    const postId = params.id;
    if (!postId) return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });

    // Use _embed to get related data like featured image URL and author name
    const response = await wpApi.get(`/posts/${postId}`, { params: { _embed: true, context: 'edit' } });
    
    const postData = response.data;
    const transformed = {
      ...postData,
      featured_image_url: postData._embedded?.['wp:featuredmedia']?.[0]?.source_url || null,
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

    const postId = params.id;
    if (!postId) return NextResponse.json({ error: 'Post ID is required.' }, { status: 400 });

    const body = await req.json();
    const validation = postUpdateSchema.safeParse(body);
    if (!validation.success) return NextResponse.json({ error: 'Invalid data.', details: validation.error.flatten() }, { status: 400 });
    
    const { tags, featured_image_src, metaDescription, focusKeyword, ...postPayload } = validation.data;
    
    // Handle tags by finding or creating them
    if (tags !== undefined) { // Check for undefined to allow clearing tags with empty string
        const tagNames = tags.split(',').map(t => t.trim()).filter(Boolean);
        (postPayload as any).tags = await findOrCreateTags(tagNames, wpApi);
    }
    
    // Handle featured image: upload if new src is provided
    if (featured_image_src) {
        const seoFilename = `${slugify(postPayload.title || 'blog-post')}-${postId}.jpg`;
        (postPayload as any).featured_media = await uploadImageToWordPress(featured_image_src, seoFilename, {
            title: postPayload.title || 'Blog Post Image',
            alt_text: postPayload.title || '',
            caption: '',
            description: postPayload.content?.substring(0, 100) || '',
        }, wpApi);
    } else if (postPayload.featured_media_id !== undefined) {
        // Handle setting an existing image or removing it
        (postPayload as any).featured_media = postPayload.featured_media_id;
    }
    
    // Add meta fields for SEO, allowing them to be cleared
    const meta: { [key: string]: string | undefined } = {};
    if (metaDescription !== undefined) {
        meta._yoast_wpseo_metadesc = metaDescription;
    }
    if (focusKeyword !== undefined) {
        meta._yoast_wpseo_focuskw = focusKeyword;
    }
    if (Object.keys(meta).length > 0) {
        (postPayload as any).meta = meta;
    }


    // WordPress API uses POST for updates
    const response = await wpApi.post(`/posts/${postId}`, postPayload);
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

    const response = await wpApi.delete(`/posts/${postId}`, { params: { force: true } });
    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error deleting post ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to delete post.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
