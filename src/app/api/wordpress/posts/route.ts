
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags } from '@/lib/api-helpers';
import { z } from 'zod';
import type { BlogPostData } from '@/lib/types';
import axios from 'axios';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};

const postSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  status: z.enum(['publish', 'draft', 'pending']),
  author: z.object({ id: z.number() }).nullable(),
  category: z.object({ id: z.number() }).nullable(),
  keywords: z.string().optional(),
  featuredImage: z.object({ uploadedUrl: z.string().url().optional() }).nullable(),
  publishDate: z.string().nullable().or(z.date().nullable()),
});

const payloadSchema = z.object({
    postData: postSchema,
    translationGroupId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
    let uid, token;
    try {
        token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }

        const body = await request.json();
        
        const validation = payloadSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ success: false, error: 'Invalid data provided', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { postData, translationGroupId } = validation.data;

        // 1. Upload featured image once, if it exists
        let featuredMediaId: number | null = null;
        if (postData.featuredImage?.uploadedUrl) {
            const seoFilename = `${slugify(postData.title || 'blog-post')}.jpg`;
            
            featuredMediaId = await uploadImageToWordPress(
                postData.featuredImage.uploadedUrl,
                seoFilename,
                {
                    title: postData.title,
                    alt_text: `Imagen destacada para: ${postData.title}`,
                    caption: '',
                    description: postData.content.substring(0, 100),
                },
                wpApi
            );
        }

        // 2. Find or create tags once
        const tagNames = postData.keywords ? postData.keywords.split(',').map(t => t.trim()).filter(Boolean) : [];
        const tagIds = await findOrCreateTags(tagNames, wpApi);
        
        // 3. Create the post
        const postPayload: any = {
            title: postData.title,
            content: postData.content,
            status: postData.status || 'draft',
            meta: { translation_group_id: translationGroupId }
        };
        if (featuredMediaId) postPayload.featured_media = featuredMediaId;
        if (postData.category?.id) postPayload.categories = [postData.category.id];
        if (tagIds.length > 0) postPayload.tags = tagIds;
        if (postData.author?.id) postPayload.author = postData.author.id;
        if (postData.publishDate) postPayload.date = new Date(postData.publishDate).toISOString();

        const postResponse = await wpApi.post('/posts', postPayload);
        const createdPost = postResponse.data;
        
        const responseData = {
            success: true,
            title: createdPost.title.rendered,
            url: createdPost.link.replace('?p=', '/wp-admin/post.php?post=') + '&action=edit',
        };
        
        return NextResponse.json(responseData, { status: 201 });

    } catch (error: any) {
        console.error('Error creating WordPress post:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the post.';
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        const userFriendlyError = `Error al crear la entrada. Razón: ${errorMessage}`;
        return NextResponse.json({ success: false, error: userFriendlyError }, { status });
    }
}
