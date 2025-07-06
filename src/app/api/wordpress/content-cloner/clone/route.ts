
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, collectElementorTexts, replaceElementorTexts } from '@/lib/api-helpers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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
            
            let uid: string;
            let authToken: string | undefined;
            try {
                authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
                if (!authToken) throw new Error('Auth token missing');
                if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
                uid = (await adminAuth.verifyIdToken(authToken)).uid;

                const body = await req.json();
                const validation = batchCloneSchema.safeParse(body);
                if (!validation.success) { throw new Error('Invalid input: ' + validation.error.message); }
                
                const { post_ids, target_lang } = validation.data;
                const target_lang_name = LANG_CODE_MAP[target_lang] || target_lang;
                
                const { wpApi, wooApi } = await getApiClientsForUser(uid);
                if (!wpApi || !wooApi) throw new Error('Both WordPress and WooCommerce APIs must be configured');
                
                const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
                if (!siteUrl) throw new Error("Could not determine base site URL.");

                const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/batch-clone-posts`;
                const cloneResponse = await wpApi.post(cloneEndpoint, { post_ids, target_lang });
                
                if (cloneResponse.status !== 200 || !cloneResponse.data) { throw new Error('Batch cloning via custom endpoint failed.'); }

                const successfullyClonedPairs = cloneResponse.data.success || [];
                const baseUrl = req.nextUrl.origin;

                for (const pair of successfullyClonedPairs) {
                    const { original_id, clone_id, post_type } = pair;
                    try {
                        write({ id: original_id, status: 'cloning', message: 'Clonado, iniciando traducción...', progress: 25 });
                        
                        if (!post_type) throw new Error('Plugin did not return a post_type.');
                        const postTypeEndpoint = post_type === 'page' ? 'pages' : (post_type === 'product' ? 'products' : 'posts');

                        let originalPost;
                        if (post_type === 'product') {
                            const { data } = await wooApi.get(`products/${original_id}`);
                            originalPost = data;
                        } else {
                            const { data } = await wpApi.get(`/${postTypeEndpoint}/${original_id}?context=edit`);
                            originalPost = data;
                        }
                        
                        let textsToTranslate: { [key: string]: string } = { title: originalPost.name || originalPost.title.rendered };
                        let elementorData = null;
                        const isElementor = post_type === 'page' && originalPost.meta && originalPost.meta._elementor_data;

                        if (isElementor) {
                            elementorData = JSON.parse(originalPost.meta._elementor_data);
                            textsToTranslate['content'] = collectElementorTexts(elementorData).join('|||');
                        } else if (post_type === 'product') {
                            textsToTranslate['short_description'] = originalPost.short_description || '';
                            textsToTranslate['description'] = originalPost.description || '';
                        } else {
                            textsToTranslate['content'] = originalPost.content.rendered;
                        }

                        write({ id: original_id, status: 'translating', message: 'Traduciendo contenido...', progress: 50 });
                        
                        const translateResponse = await fetch(`${baseUrl}/api/translate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                            body: JSON.stringify({ contentToTranslate: textsToTranslate, targetLanguage: target_lang_name }),
                        });
                        if (!translateResponse.ok) throw new Error(`AI translation failed for clone of ${original_id}`);
                        const translated = await translateResponse.json();
                        
                        write({ id: original_id, status: 'updating', message: 'Traducción completa, actualizando...', progress: 75 });

                        const { title: translatedTitle, ...translatedContent } = translated;
                        const updatePayload: any = { title: translatedTitle, status: 'draft' };

                        if (isElementor) {
                            const translatedTexts = translatedContent.content.split('|||');
                            updatePayload.meta = { _elementor_data: JSON.stringify(replaceElementorTexts(JSON.parse(JSON.stringify(elementorData)), translatedTexts)) };
                        } else if (post_type === 'product') {
                            updatePayload.short_description = translatedContent.short_description;
                            updatePayload.description = translatedContent.description;
                            if (originalPost.sku) {
                                updatePayload.sku = `${originalPost.sku}-${target_lang.toUpperCase()}`;
                            }
                        } else {
                            updatePayload.content = translatedContent.content;
                        }
                        
                        if (post_type === 'product') {
                            await wooApi.put(`products/${clone_id}`, updatePayload);
                        } else {
                            await wpApi.post(`/${postTypeEndpoint}/${clone_id}`, updatePayload);
                        }

                        write({ id: original_id, status: 'success', message: '¡Completado!', progress: 100 });
                    } catch (error: any) {
                        const reason = error.response?.data?.message || error.message || 'Unknown error during translation/update.';
                        write({ id: original_id, status: 'failed', message: `Error: ${reason}`, progress: 0 });
                    }
                }
                 cloneResponse.data.failed?.forEach((failure: any) => {
                    write({ id: failure.id, status: 'failed', message: `Error en clonación inicial: ${failure.reason}`, progress: 0 });
                 });
            } catch (error: any) {
                 const finalError = { status: 'error', message: `Error fatal: ${error.message}` };
                 controller.enqueue(encoder.encode(JSON.stringify(finalError)));
            } finally {
                controller.close();
            }
        }
    });
    return new NextResponse(stream, { headers: { 'Content-Type': 'application/json' } });
}
