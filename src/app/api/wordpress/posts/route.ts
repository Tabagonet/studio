

import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags, findOrCreateWpCategoryByPath } from '@/lib/api-helpers';
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
  categoryPath: z.string().optional(),
  tags: z.array(z.string()).optional(),
  featuredImage: z.object({ uploadedUrl: z.string().url().optional() }).nullable(),
  publishDate: z.string().nullable().or(z.date().nullable()),
  metaDescription: z.string().optional(),
  focusKeyword: z.string().optional(),
  sourceLanguage: z.string().optional(), // Now expects the name, e.g., "Spanish"
  targetLanguages: z.array(z.string()).optional(),
});

// The payload for creating a single post. Linking is now handled separately.
const payloadSchema = z.object({
    postData: postSchema,
    lang: z.string(), // e.g. 'en', 'es'
});

export async function POST(request: NextRequest) {
    let uid: string;
    try {
        const token = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) { return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 }); }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) { throw new Error('WordPress API is not configured for the active connection.'); }

        const body = await request.json();
        
        const validation = payloadSchema.safeParse(body);
        if (!validation.success) {
             return NextResponse.json({ success: false, error: 'Invalid data provided', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { postData, lang } = validation.data;

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
        const tagNames = postData.tags || [];
        const tagIds = await findOrCreateTags(tagNames, wpApi);
        
        // 3. Find or create category
        let finalCategoryId: number | null = null;
        if (postData.categoryPath) {
            finalCategoryId = await findOrCreateWpCategoryByPath(postData.categoryPath, wpApi);
        } else if (postData.category) {
            finalCategoryId = postData.category.id;
        }

        // 4. Create the post
        const postPayload: any = {
            title: postData.title,
            content: postData.content,
            status: postData.status || 'draft',
            lang: lang,
            meta: { 
                ...(postData.metaDescription && { _yoast_wpseo_metadesc: postData.metaDescription }),
                ...(postData.focusKeyword && { _yoast_wpseo_focuskw: postData.focusKeyword }),
             }
        };
        if (featuredMediaId) postPayload.featured_media = featuredMediaId;
        if (finalCategoryId) postPayload.categories = [finalCategoryId];
        if (tagIds.length > 0) postPayload.tags = tagIds;
        if (postData.author?.id) postPayload.author = postData.author.id;
        if (postData.publishDate) postPayload.date = new Date(postData.publishDate).toISOString();

        const postResponse = await wpApi.post('/posts', postPayload);
        const createdPost = postResponse.data;
        
        const responseData = {
            success: true,
            id: createdPost.id,
            lang: createdPost.lang, // Return the language slug of the created post
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
