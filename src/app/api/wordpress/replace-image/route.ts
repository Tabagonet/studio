

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const { wpApi, wooApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }

        const formData = await req.formData();
        const newImageFile = formData.get('newImageFile') as File | null;
        const postId = Number(formData.get('postId'));
        const postType = formData.get('postType') as 'Post' | 'Page' | 'Producto';
        const oldImageUrl = formData.get('oldImageUrl') as string | null;

        if (!newImageFile || !postId || !postType || !oldImageUrl) {
            return NextResponse.json({ error: 'Faltan datos en la petición.' }, { status: 400 });
        }

        let post: any;
        if (postType === 'Producto') {
            if (!wooApi) throw new Error('WooCommerce API is not configured.');
            const { data } = await wooApi.get(`products/${postId}`);
            post = { ...data, title: { rendered: data.name }, content: { rendered: data.description } };
        } else {
            const endpoint = postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;
            const { data } = await wpApi.get(endpoint, { params: { context: 'edit' } });
            post = data;
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

        const payload = { mode: 'generate_image_meta', language: 'Spanish', existingTitle: post.title.rendered, existingContent: post.content.rendered };
        const prompt = `You are an expert SEO specialist. Generate generic but descriptive SEO metadata for images based on a blog post's content. Respond with a JSON object: {"imageTitle": "title", "imageAltText": "alt text"}.\n\nGenerate generic image metadata in Spanish for a blog post titled "${payload.existingTitle}".`;
        const result = await model.generateContent(prompt);
        const aiContent = JSON.parse(result.response.text());

        const tempArrayBuffer = await newImageFile.arrayBuffer();
        const tempBuffer = Buffer.from(tempArrayBuffer);

        const newImageId = await uploadImageToWordPress(
            `data:${newImageFile.type};base64,${tempBuffer.toString('base64')}`,
            `${slugify(post.title.rendered || 'image')}-${Date.now()}.jpg`,
            {
                title: aiContent.imageTitle || post.title.rendered,
                alt_text: aiContent.imageAltText || post.title.rendered,
                caption: '',
                description: '',
            },
            wpApi
        );
        
        const newMediaData = await wpApi.get(`/media/${newImageId}`);
        const newImageUrl = newMediaData.data.source_url;
        
        let currentContent = post.content?.rendered || '';
        const newContent = currentContent.replace(new RegExp(oldImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newImageUrl);
        
        const updatePayload: { [key: string]: any } = {};
        if (postType === 'Producto') {
          updatePayload.description = newContent;
        } else {
          updatePayload.content = newContent;
        }
        
        const updateEndpoint = postType === 'Producto' ? `products/${postId}` : postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;
        const apiToUse = postType === 'Producto' ? wooApi : wpApi;

        await apiToUse.put(updateEndpoint, updatePayload);

        const mediaIdMatch = oldImageUrl.match(/wp-image-(\d+)/);
        if (mediaIdMatch?.[1]) {
            const oldImageId = parseInt(mediaIdMatch[1], 10);
            if (!isNaN(oldImageId)) {
                wpApi.delete(`/media/${oldImageId}`, { params: { force: true } }).catch(e => console.error(`Failed to delete old image ${oldImageId}:`, e.message));
            }
        }
        
        await adminDb.collection('user_settings').doc(uid).set({ 
            aiUsageCount: admin.firestore.FieldValue.increment(1) 
        }, { merge: true });

        return NextResponse.json({ success: true, newImageUrl, newImageAlt: aiContent.imageAltText });

    } catch (error: any) {
        console.error("Error in replace-image API:", error.response?.data || error.message);
        return NextResponse.json({ error: 'Failed to replace image', message: error.message }, { status: 500 });
    }
}
