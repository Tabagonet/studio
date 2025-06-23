
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, findOrCreateTags, translateContent } from '@/lib/api-helpers';
import { z } from 'zod';
import type { BlogPostData } from '@/lib/types';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';


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
  topic: z.string().optional(),
  keywords: z.string().optional(),
  categoryId: z.number().nullable(),
  status: z.enum(['publish', 'draft', 'pending']),
  featuredImage: z.any().nullable(), // Simplified for validation
  sourceLanguage: z.string(),
  targetLanguages: z.array(z.string()),
  authorId: z.number().nullable(),
  publishDate: z.string().nullable(), // Expecting ISO string from client
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
        const postData: BlogPostData = await request.json();
        
        const validation = postSchema.safeParse(postData);
        if (!validation.success) {
             return NextResponse.json({ success: false, error: 'Invalid data provided', details: validation.error.flatten() }, { status: 400 });
        }
        
        const translationGroupId = uuidv4();
        const createdPosts: { url: string; title: string }[] = [];

        // 1. Upload featured image once, if it exists
        let featuredMediaId: number | null = null;
        if (postData.featuredImage?.file) {
             const tempFormData = new FormData();
             tempFormData.append('imagen', postData.featuredImage.file);
             const tempUploadResponse = await axios.post(`${request.nextUrl.origin}/api/upload-image`, tempFormData, { headers: { 'Authorization': `Bearer ${token}` } });
             if (!tempUploadResponse.data.success) throw new Error(`Failed to upload image to temp host: ${tempUploadResponse.data.error}`);
            
            const tempImageUrl = tempUploadResponse.data.url;
            const seoFilename = `${slugify(postData.title || 'blog-post')}.jpg`;
            featuredMediaId = await uploadImageToWordPress(tempImageUrl, seoFilename, { title: postData.title, alt_text: `Imagen destacada para: ${postData.title}`, caption: '', description: postData.content.substring(0, 100), }, wpApi);
        }

        // 2. Find or create tags once
        const tagNames = postData.keywords ? postData.keywords.split(',').map(t => t.trim()).filter(Boolean) : [];
        const tagIds = await findOrCreateTags(tagNames, wpApi);
        
        // 3. Create the original post
        const originalPostPayload: any = {
            title: postData.title,
            content: postData.content,
            status: postData.status || 'draft',
            meta: { translation_group_id: translationGroupId }
        };
        if (featuredMediaId) originalPostPayload.featured_media = featuredMediaId;
        if (postData.categoryId) originalPostPayload.categories = [postData.categoryId];
        if (tagIds.length > 0) originalPostPayload.tags = tagIds;
        if (postData.authorId) originalPostPayload.author = postData.authorId;
        if (postData.publishDate) originalPostPayload.date = postData.publishDate;

        const originalPostResponse = await wpApi.post('/posts', originalPostPayload);
        const originalPost = originalPostResponse.data;
        createdPosts.push({ url: originalPost.link.replace('?p=', '/wp-admin/post.php?post=') + '&action=edit', title: originalPost.title.rendered });


        // 4. Create translated posts
        for (const lang of postData.targetLanguages) {
            try {
                const translatedContent = await translateContent({ title: postData.title, content: postData.content }, lang);
                const translatedPostPayload = {
                    ...originalPostPayload,
                    title: translatedContent.title,
                    content: translatedContent.content,
                };
                const translatedPostResponse = await wpApi.post('/posts', translatedPostPayload);
                const translatedPost = translatedPostResponse.data;
                createdPosts.push({ url: translatedPost.link.replace('?p=', '/wp-admin/post.php?post=') + '&action=edit', title: translatedPost.title.rendered });
            } catch (translationError) {
                console.error(`Failed to create translation for ${lang}:`, translationError);
                // Don't stop the whole process, just skip this language
            }
        }
        
        return NextResponse.json({ success: true, createdPosts }, { status: 201 });

    } catch (error: any) {
        console.error('Error creating WordPress post:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the post.';
        const userFriendlyError = `Error al crear la entrada. Razón: ${errorMessage}`;
        return NextResponse.json({ success: false, error: userFriendlyError }, { status: 500 });
    }
}
