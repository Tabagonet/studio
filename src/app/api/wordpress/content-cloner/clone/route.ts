
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, translateContent } from '@/lib/api-helpers';
import { z } from 'zod';

const cloneSchema = z.object({
  sourceId: z.number(),
  sourceType: z.enum(['Post', 'Page']),
});

/**
 * This is a simplified and more robust version of the cloning logic.
 * It avoids deep Elementor JSON parsing to prevent timeouts.
 * The primary goal is to clone the structure and core content reliably.
 * Deep translation of builder widgets can be a future enhancement.
 */
export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = cloneSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { sourceId, sourceType } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) throw new Error('WordPress API is not configured');
        
        const sourceEndpoint = sourceType === 'Post' ? 'posts' : 'pages';
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) throw new Error("Could not determine base site URL.");

        // === Step 1: Clone the post using the reliable custom endpoint ===
        const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/clone-post/${sourceId}`;
        const cloneResponse = await wpApi.post(cloneEndpoint);
        
        if (!cloneResponse.data.success || !cloneResponse.data.new_post_id) {
            throw new Error('Cloning via custom endpoint failed: ' + (cloneResponse.data.message || 'Unknown error from plugin.'));
        }
        const newPostId = cloneResponse.data.new_post_id;

        // === Step 2: Fetch source post data for translation ===
        const { data: sourcePost } = await wpApi.get(`/${sourceEndpoint}/${sourceId}`, { params: { context: 'edit' } });
        const sourceLang = sourcePost.lang || 'es';
        const targetLang = sourceLang === 'es' ? 'en' : 'es';
        const targetLangFullName = sourceLang === 'es' ? 'English' : 'Spanish';
        
        // === Step 3: Translate only the core content to avoid timeouts ===
        const { title: translatedTitle, content: translatedContent } = await translateContent({
            title: sourcePost.title.rendered,
            content: sourcePost.content.rendered // For Elementor, this is often empty, which is fast.
        }, targetLangFullName);
        
        // Translate SEO meta fields if they exist
        const metaDescription = sourcePost.meta?._yoast_wpseo_metadesc || '';
        const focusKeyword = sourcePost.meta?._yoast_wpseo_focuskw || '';
        const { content: translatedMeta } = await translateContent({ title: '', content: `${metaDescription}[SEP]${focusKeyword}` }, targetLangFullName);
        const [translatedMetaDesc, translatedFocusKw] = translatedMeta.split('[SEP]').map(s => s.trim());

        // === Step 4: Update the cloned draft with translated content ===
        const updatePayload: any = {
            title: translatedTitle,
            content: translatedContent,
            lang: targetLang, // Set the language of the new post
            status: 'draft', // Ensure it's a draft
            meta: {
                ...(translatedMetaDesc && { _yoast_wpseo_metadesc: translatedMetaDesc }),
                ...(translatedFocusKw && { _yoast_wpseo_focuskw: translatedFocusKw }),
            }
        };

        const { data: updatedPost } = await wpApi.post(`/${sourceEndpoint}/${newPostId}`, updatePayload);

        // === Step 5: Link the source and the new clone using Polylang's function via our endpoint ===
        const linkEndpoint = `${siteUrl}/wp-json/custom/v1/link-translations`;
        const translations = {
            [sourceLang]: sourceId,
            [targetLang]: newPostId
        };
        await wpApi.post(linkEndpoint, { translations });

        return NextResponse.json({ success: true, message: 'Clonación completada', newPost: updatedPost });

    } catch (error: any) {
        console.error("Error in clone endpoint:", error.response?.data || error.message);
        return NextResponse.json({ error: "Failed to clone content", message: error.message }, { status: 500 });
    }
}
