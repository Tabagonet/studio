
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";

const syncSchema = z.object({
  sourcePostId: z.number(),
  postType: z.enum(['Post', 'Page']),
  translations: z.record(z.string(), z.number()),
  metaDescription: z.string().optional(),
  focusKeyword: z.string().optional(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    let token: string;
    try {
        const authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) throw new Error('Auth token missing');
        token = authToken;
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = syncSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }

        const { sourcePostId, postType, translations, metaDescription, focusKeyword } = validation.data;

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API not configured');
        }

        const sourceLang = Object.keys(translations).find(key => translations[key] === sourcePostId);
        if (!sourceLang) {
            throw new Error('Could not determine source language from translations object.');
        }

        const endpoint = postType === 'Post' ? 'posts' : 'pages';

        const results = {
            success: [] as string[],
            failed: [] as { lang: string; reason: string }[],
        };
        
        const baseUrl = req.nextUrl.origin;

        for (const [lang, postId] of Object.entries(translations)) {
            if (lang === sourceLang) continue; // Skip the source post

            try {
                const contentToTranslate: { [key: string]: string } = {};
                if (metaDescription) contentToTranslate.metaDescription = metaDescription;
                if (focusKeyword) contentToTranslate.focusKeyword = focusKeyword;
                
                let translatedMetaDescription: string | undefined;
                let translatedFocusKeyword: string | undefined;

                if (Object.keys(contentToTranslate).length > 0) {
                     const translateResponse = await fetch(`${baseUrl}/api/translate`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ contentToTranslate, targetLanguage: lang })
                     });

                     if (!translateResponse.ok) {
                        const errorData = await translateResponse.json();
                        throw new Error(errorData.error || `La traducción para ${lang} falló.`);
                     }
                     const output = await translateResponse.json();
                     
                     if (!output || typeof output !== 'object') throw new Error('AI returned a non-object or empty response for translation.');

                    translatedMetaDescription = (output as any).metaDescription;
                    translatedFocusKeyword = (output as any).focusKeyword;
                }

                const payload: { meta: { [key: string]: string | undefined } } = { meta: {} };
                
                if (translatedMetaDescription !== undefined) {
                    payload.meta._yoast_wpseo_metadesc = translatedMetaDescription;
                }
                 if (translatedFocusKeyword !== undefined) {
                    payload.meta._yoast_wpseo_focuskw = translatedFocusKeyword;
                }
                
                if (Object.keys(payload.meta).length > 0) {
                    await wpApi.post(`/${endpoint}/${postId}`, payload);
                    results.success.push(lang.toUpperCase());
                }

            } catch (error: any) {
                console.error(`Failed to sync SEO for lang ${lang} (post ${postId}):`, error.response?.data || error.message);
                results.failed.push({ lang, reason: error.response?.data?.message || 'Unknown error' });
            }
        }

        const message = `Sincronización completada. Éxito: ${results.success.length > 0 ? results.success.join(', ') : 'ninguno'}. Fallos: ${results.failed.length}.`;
        
        return NextResponse.json({ success: true, message, results });

    } catch (error: any) {
        console.error("🔥 Error in /api/seo/sync-translations:", error);
        return NextResponse.json({ error: "Failed to sync SEO translations", message: error.message }, { status: 500 });
    }
}
