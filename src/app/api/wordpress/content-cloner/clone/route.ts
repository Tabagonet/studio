
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, translateContent, collectElementorTexts, replaceElementorTexts } from '@/lib/api-helpers';
import { z } from 'zod';

const batchCloneSchema = z.object({
  post_ids: z.array(z.number()),
  target_lang: z.string(),
});

const LANG_CODE_MAP: { [key: string]: string } = {
    'es': 'Spanish',
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'pt': 'Portuguese',
    'it': 'Italian',
};

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
        const validation = batchCloneSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { post_ids, target_lang } = validation.data;
        const target_lang_name = LANG_CODE_MAP[target_lang] || target_lang;
        
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) throw new Error('WordPress API is not configured');
        
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) throw new Error("Could not determine base site URL.");

        // === 1. CLONE POSTS VIA PLUGIN ===
        const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/batch-clone-posts`;
        const cloneResponse = await wpApi.post(cloneEndpoint, { post_ids, target_lang });
        
        if (cloneResponse.status !== 200 || !cloneResponse.data.success) {
            throw new Error('Batch cloning via custom endpoint failed: ' + (cloneResponse.data.failed?.[0]?.reason || 'Unknown error from plugin.'));
        }

        const finalResults = {
            success: [] as any[],
            failed: cloneResponse.data.failed || [],
        };

        const successfullyClonedPairs = cloneResponse.data.success || [];

        // === 2. TRANSLATE AND UPDATE EACH CLONE ===
        for (const pair of successfullyClonedPairs) {
            const { original_id, clone_id } = pair;
            try {
                // Fetch full data of the original post
                const { data: originalPost } = await wpApi.get(`/posts/${original_id}?context=edit`);
                const postTypeEndpoint = originalPost.type === 'page' ? 'pages' : 'posts';

                let textsToTranslate: { title: string, content: string };
                let elementorData = null;
                const isElementor = originalPost.meta && originalPost.meta._elementor_data;

                if (isElementor) {
                    elementorData = JSON.parse(originalPost.meta._elementor_data);
                    const elementorTexts = collectElementorTexts(elementorData);
                    // Join with a rare separator to ensure clean splitting after translation
                    textsToTranslate = { title: originalPost.title.rendered, content: elementorTexts.join('|||') };
                } else {
                    textsToTranslate = { title: originalPost.title.rendered, content: originalPost.content.rendered };
                }
                
                // Translate
                const { title: translatedTitle, content: translatedContentString } = await translateContent(
                    textsToTranslate,
                    target_lang_name
                );

                // Prepare update payload
                const updatePayload: any = {
                    title: translatedTitle,
                    status: 'draft',
                };
                if (isElementor) {
                    const translatedTexts = translatedContentString.split('|||');
                    const newElementorData = replaceElementorTexts(elementorData, translatedTexts);
                    updatePayload.meta = { _elementor_data: JSON.stringify(newElementorData) };
                } else {
                    updatePayload.content = translatedContentString;
                }
                
                // Update the clone
                await wpApi.post(`/${postTypeEndpoint}/${clone_id}`, updatePayload);
                finalResults.success.push(pair);

            } catch (error: any) {
                console.error(`Failed to translate/update clone for original ID ${original_id}:`, error.response?.data || error.message);
                finalResults.failed.push({ id: original_id, reason: 'Failed to translate or update content after cloning.' });
            }
        }
        
        return NextResponse.json({ success: true, message: 'Proceso de clonación y traducción completado.', data: finalResults });

    } catch (error: any) {
        console.error("Error in batch clone endpoint:", error.response?.data || error.message);
        return NextResponse.json({ error: "Failed to clone content in batch", message: error.message }, { status: 500 });
    }
}
