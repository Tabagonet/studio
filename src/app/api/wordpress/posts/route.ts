
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

        // 1. Upload featured image if it exists
        let featuredMediaId: number | null = null;
        if (postData.featuredImage?.file) {
             // To upload the new file, we must first upload it to our temporary host
             const tempFormData = new FormData();
             tempFormData.append('imagen', postData.featuredImage.file);

             const tempUploadResponse = await axios.post(`${request.nextUrl.origin}/api/upload-image`, tempFormData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!tempUploadResponse.data.success) {
                throw new Error(`Failed to upload image to temp host: ${tempUploadResponse.data.error}`);
            }
            
            const tempImageUrl = tempUploadResponse.data.url;

            // Now, upload from the temp host to WordPress
            const seoFilename = `${slugify(postData.title || 'blog-post')}.jpg`;
            featuredMediaId = await uploadImageToWordPress(
                tempImageUrl,
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

        // 2. Find or create tags
        const tagNames = postData.keywords ? postData.keywords.split(',').map(t => t.trim()).filter(Boolean) : [];
        const tagIds = await findOrCreateTags(tagNames, wpApi);
        
        // 3. Prepare post payload for WordPress
        const wpPostPayload: any = {
            title: postData.title,
            content: postData.content,
            status: postData.status || 'draft',
        };

        if (featuredMediaId) {
            wpPostPayload.featured_media = featuredMediaId;
        }
        if (postData.categoryId) {
            wpPostPayload.categories = [postData.categoryId];
        }
        if (tagIds.length > 0) {
            wpPostPayload.tags = tagIds;
        }

        // 4. Create the post
        const response = await wpApi.post('/posts', wpPostPayload);
        const createdPost = response.data;
        
        const adminUrl = createdPost.link.replace('?p=', '/wp-admin/post.php?post=') + '&action=edit';

        return NextResponse.json({ success: true, data: createdPost, post_url: adminUrl }, { status: response.status });

    } catch (error: any) {
        console.error('Error creating WordPress post:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the post.';
        const userFriendlyError = `Error al crear la entrada. Razón: ${errorMessage}`;
        return NextResponse.json({ success: false, error: userFriendlyError }, { status: 500 });
    }
}
