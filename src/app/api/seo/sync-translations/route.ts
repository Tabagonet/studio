
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, translateContent } from '@/lib/api-helpers';
import { z } from 'zod';

const syncSchema = z.object({
  sourcePostId: z.number(),
  translations: z.record(z.string(), z.number()),
  metaDescription: z.string().optional(),
  focusKeyword: z.string().optional(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
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

        const { sourcePostId, translations, metaDescription, focusKeyword } = validation.data;

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API not configured');
        }

        const sourceLang = Object.keys(translations).find(key => translations[key] === sourcePostId);
        if (!sourceLang) {
            throw new Error('Could not determine source language from translations object.');
        }

        const results = {
            success: [] as string[],
            failed: [] as { lang: string; reason: string }[],
        };

        for (const [lang, postId] of Object.entries(translations)) {
            if (lang === sourceLang) continue; // Skip the source post

            try {
                // Translate SEO fields if they exist
                const translatedMetaDescription = metaDescription
                    ? (await translateContent({ title: '', content: metaDescription }, lang)).content
                    : undefined;

                const translatedFocusKeyword = focusKeyword
                    ? (await translateContent({ title: '', content: focusKeyword }, lang)).content
                    : undefined;

                // Update the translated post
                const payload: { meta: { [key: string]: string | undefined } } = { meta: {} };
                
                if (translatedMetaDescription !== undefined) {
                    payload.meta._yoast_wpseo_metadesc = translatedMetaDescription;
                }
                 if (translatedFocusKeyword !== undefined) {
                    payload.meta._yoast_wpseo_focuskw = translatedFocusKeyword;
                }
                
                // Only make the API call if there's something to update
                if (Object.keys(payload.meta).length > 0) {
                    await wpApi.post(`/posts/${postId}`, payload);
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
        console.error("Error in sync-translations endpoint:", error);
        return NextResponse.json({ error: "Failed to sync SEO translations", message: error.message }, { status: 500 });
    }
}
