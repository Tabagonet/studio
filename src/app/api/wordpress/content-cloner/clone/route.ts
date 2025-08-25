
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, collectElementorTexts, replaceElementorTexts } from '@/lib/api-helpers';
import { z } from 'zod';
import type { ContentItem } from '@/lib/types';

const contentItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  type: z.enum(['Post', 'Page', 'Producto']),
  link: z.string().url(),
  status: z.string(),
  parent: z.number(),
  lang: z.string().optional().nullable(),
  translations: z.record(z.number()).optional().nullable(),
  modified: z.string(),
  score: z.number().optional().nullable(),
});

const batchCloneSchema = z.object({
  items: z.array(contentItemSchema),
  target_lang: z.string(),
});

const LANG_CODE_MAP: { [key: string]: string } = {
    'es': 'Spanish',
    'en': 'English',
    'fr': 'French',
    'de': 'German',
    'pt': 'Portuguese',
    'it': 'Italiano',
    'nl': 'Dutch',
    'ru': 'Russian',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'ko': 'Korean',
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
                
                const { items, target_lang } = validation.data;
                const target_lang_name = LANG_CODE_MAP[target_lang] || target_lang;
                console.log(`[Cloner] Received request to clone ${items.length} items to language '${target_lang_name}'`);
                
                const { wpApi, wooApi } = await getApiClientsForUser(uid);
                
                const siteUrl = wpApi?.defaults.baseURL?.replace('/wp-json/wp/v2', '');
                if (!siteUrl) throw new Error("Could not determine base site URL.");
                console.log(`[Cloner] Site URL determined: ${siteUrl}`);

                const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/batch-clone-posts`;
                
                for (const item of items) {
                     try {
                        // Check if a translation already exists
                        if (item.translations && item.translations[target_lang]) {
                             write({ id: item.id, status: 'skipped', message: `Ya existe una traducción en ${target_lang}.`, progress: 100 });
                             console.log(`[Cloner] Skipping item ${item.id}, translation to ${target_lang} already exists.`);
                             continue;
                        }

                        write({ id: item.id, status: 'cloning', message: 'Clonando estructura...', progress: 25 });
                        const cloneResponse = await wpApi?.post(cloneEndpoint, { post_ids: [item.id], target_lang });
                        if (cloneResponse?.status !== 200 || !cloneResponse.data || !cloneResponse.data.success?.[0]) {
                            throw new Error(cloneResponse?.data?.failed?.[0]?.reason || 'Initial cloning failed via plugin.');
                        }
                        
                        const { clone_id, post_type } = cloneResponse.data.success[0];
                        console.log(`[Cloner] Item ${item.id} cloned to new ID ${clone_id} with type ${post_type}.`);

                        // --- Content Translation ---
                        write({ id: item.id, status: 'translating', message: 'Traduciendo contenido...', progress: 50 });
                        
                        const isProduct = post_type === 'product';
                        const apiToUse = isProduct ? wooApi : wpApi;
                        if (!apiToUse) throw new Error(`API client for post type '${post_type}' is not configured.`);
                        
                        const postTypeEndpoint = isProduct ? `products/${item.id}` : (post_type === 'page' ? `pages/${item.id}` : `posts/${item.id}`);
                        const { data: originalPost } = await apiToUse.get(postTypeEndpoint, { params: { context: 'edit' } });
                        
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
                        
                        const translateResponse = await fetch(`${req.nextUrl.origin}/api/translate`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                            body: JSON.stringify({ contentToTranslate: textsToTranslate, targetLanguage: target_lang_name }),
                        });
                        if (!translateResponse.ok) throw new Error(`AI translation failed for clone of ${item.id}`);
                        const translated = await translateResponse.json();
                        
                        // --- Update Cloned Post ---
                        write({ id: item.id, status: 'updating', message: 'Traducción completa, actualizando...', progress: 75 });
                        
                        const { title: translatedTitle, ...translatedContent } = translated;
                        const updatePayload: any = { status: 'draft' };
                        const updateEndpoint = isProduct ? `products/${clone_id}` : (post_type === 'page' ? `pages/${clone_id}` : `posts/${clone_id}`);

                        if (isProduct) {
                            updatePayload.name = translatedTitle;
                            updatePayload.short_description = translatedContent.short_description;
                            updatePayload.description = translatedContent.description;
                            if (originalPost.sku) updatePayload.sku = `${originalPost.sku}-${target_lang.toUpperCase()}`;
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
                        
                        await apiToUse.put(updateEndpoint, updatePayload);

                        write({ id: item.id, status: 'success', message: '¡Completado!', progress: 100 });
                        console.log(`[Cloner] Clone ${clone_id} successfully updated.`);
                     } catch (error: any) {
                        const reason = error.response?.data?.message || error.message || 'Unknown error during translation/update.';
                        write({ id: item.id, status: 'failed', message: `Error: ${reason}`, progress: 0 });
                        console.error(`[Cloner] Failed processing item ${item.id}:`, reason);
                    }
                }
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
