

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, collectElementorTexts, replaceElementorTexts } from '@/lib/api-helpers';
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
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const write = (data: object) => controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
            console.log('[Cloner] Stream started.');
            
            let uid: string;
            let authToken: string | undefined;
            try {
                authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
                if (!authToken) throw new Error('Auth token missing');
                if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
                uid = (await adminAuth.verifyIdToken(authToken)).uid;
                console.log(`[Cloner] User authenticated: ${uid}`);

                const body = await req.json();
                const validation = batchCloneSchema.safeParse(body);
                if (!validation.success) { throw new Error('Invalid input: ' + validation.error.message); }
                
                const { post_ids, target_lang } = validation.data;
                const target_lang_name = LANG_CODE_MAP[target_lang] || target_lang;
                console.log(`[Cloner] Received request to clone ${post_ids.length} posts to language '${target_lang_name}'`);
                
                const { wpApi, wooApi } = await getApiClientsForUser(uid);
                
                const siteUrl = wpApi?.defaults.baseURL?.replace('/wp-json/wp/v2', '');
                if (!siteUrl) throw new Error("Could not determine base site URL.");
                console.log(`[Cloner] Site URL determined: ${siteUrl}`);

                const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/batch-clone-posts`;
                const cloneResponse = await wpApi?.post(cloneEndpoint, { post_ids, target_lang });
                
                if (cloneResponse?.status !== 200 || !cloneResponse.data) { throw new Error('Batch cloning via custom endpoint failed.'); }
                console.log('[Cloner] Initial cloning via plugin successful.');

                const successfullyClonedPairs = cloneResponse.data.success || [];
                const baseUrl = req.nextUrl.origin;

                for (const pair of successfullyClonedPairs) {
                    const { original_id, clone_id, post_type } = pair;
                    console.log(`[Cloner] Processing pair: original=${original_id}, clone=${clone_id}, type=${post_type}`);
                    try {
                        write({ id: original_id, status: 'cloning', message: 'Clonado, iniciando traducción...', progress: 25 });
                        
                        if (!post_type) throw new Error('Plugin did not return a post_type.');

                        const isProduct = post_type === 'product';
                        const apiToUse = isProduct ? wooApi : wpApi;
                        if (!apiToUse) throw new Error(`API client for post type '${post_type}' is not configured.`);
                        
                        const postTypeEndpoint = isProduct ? `products/${original_id}` : (post_type === 'page' ? `pages/${original_id}` : `posts/${original_id}`);

                        const { data: originalPost } = await apiToUse.get(postTypeEndpoint, { params: { context: 'edit' } });
                        console.log(`[Cloner] Fetched original post data for ID ${original_id}.`);
                        
                        let textsToTranslate: { [key: string]: string } = { title: originalPost.name || originalPost.title.rendered };
                        let elementorData = null;
                        
                        const meta = originalPost.meta_data 
                            ? originalPost.meta_data.reduce((obj: any, item: any) => ({...obj, [item.key]: item.value}), {}) 
                            : originalPost.meta;
                        
                        const isElementor = post_type === 'page' && meta?._elementor_data;

                        if (isElementor) {
                            elementorData = JSON.parse(meta._elementor_data);
                            const collectedTexts = collectElementorTexts(elementorData);
                            textsToTranslate['content'] = collectedTexts.join('|||');
                        } else if (isProduct) {
                            textsToTranslate['short_description'] = originalPost.short_description || '';
                            textsToTranslate['description'] = originalPost.description || '';
                        } else {
                            textsToTranslate['content'] = originalPost.content?.rendered || '';
                        }

                        write({ id: original_id, status: 'translating', message: 'Traduciendo contenido...', progress: 50 });
                        console.log(`[Cloner] Translating content for post ${original_id}...`);
                        
                        const translateResponse = await fetch(`${baseUrl}/api/translate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                            body: JSON.stringify({ contentToTranslate, targetLanguage: target_lang_name }),
                        });
                        if (!translateResponse.ok) throw new Error(`AI translation failed for clone of ${original_id}`);
                        const translated = await translateResponse.json();
                        
                        write({ id: original_id, status: 'updating', message: 'Traducción completa, actualizando...', progress: 75 });
                        console.log(`[Cloner] Translation complete for post ${original_id}. Updating clone...`);

                        const { title: translatedTitle, ...translatedContent } = translated;
                        const updatePayload: any = { status: 'draft' };
                        const updateEndpoint = isProduct ? `products/${clone_id}` : (post_type === 'page' ? `pages/${clone_id}` : `posts/${clone_id}`);

                        if (isProduct) {
                            updatePayload.name = translatedTitle;
                            updatePayload.short_description = translatedContent.short_description;
                            updatePayload.description = translatedContent.description;
                            if (originalPost.sku) {
                                updatePayload.sku = `${originalPost.sku}-${target_lang.toUpperCase()}`;
                            }
                        } else {
                             updatePayload.title = translatedTitle;
                             if (isElementor && elementorData) {
                                const translatedTexts = translatedContent.content.split('|||');
                                const newElementorData = replaceElementorTexts(JSON.parse(JSON.stringify(elementorData)), translatedTexts);
                                updatePayload.meta = { _elementor_data: JSON.stringify(newElementorData) };
                            } else {
                                updatePayload.content = translatedContent.content;
                            }
                        }
                        
                        if (isProduct) {
                            await wooApi?.put(updateEndpoint, updatePayload);
                        } else {
                            await wpApi?.post(updateEndpoint, updatePayload);
                        }

                        write({ id: original_id, status: 'success', message: '¡Completado!', progress: 100 });
                        console.log(`[Cloner] Clone ${clone_id} successfully updated.`);
                    } catch (error: any) {
                        const reason = error.response?.data?.message || error.message || 'Unknown error during translation/update.';
                        write({ id: original_id, status: 'failed', message: `Error: ${reason}`, progress: 0 });
                        console.error(`[Cloner] Failed processing pair for original ${original_id}:`, reason);
                    }
                }
                 cloneResponse.data.failed?.forEach((failure: any) => {
                    write({ id: failure.id, status: 'failed', message: `Error en clonación inicial: ${failure.reason}`, progress: 0 });
                    console.error(`[Cloner] Initial clone failed for ID ${failure.id}:`, failure.reason);
                 });
            } catch (error: any) {
                 const finalError = { status: 'error', message: `Error fatal: ${error.message}` };
                 write(finalError);
                 console.error('[Cloner] Fatal error in stream:', error.message);
            } finally {
                controller.close();
                console.log('[Cloner] Stream closed.');
            }
        }
    });
    return new NextResponse(stream, { headers: { 'Content-Type': 'application/json' } });
}
