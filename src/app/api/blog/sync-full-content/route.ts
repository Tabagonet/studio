
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';
import { translateContent } from '@/ai/flows/translate-content-flow';

const syncSchema = z.object({
  sourcePostId: z.number(),
  postType: z.enum(['Post', 'Page']),
  translations: z.record(z.string(), z.number()),
  title: z.string(),
  content: z.string(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(authToken);
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

        const { sourcePostId, postType, translations, title, content } = validation.data;

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

        for (const [lang, postId] of Object.entries(translations)) {
            if (lang === sourceLang) continue; // Skip the source post

            try {
                const translated = await translateContent({
                    contentToTranslate: { title, content },
                    targetLanguage: lang,
                });
                
                if (!translated.title || !translated.content) {
                    throw new Error(`AI returned invalid structure for lang ${lang}`);
                }
                
                const payload = {
                    title: translated.title,
                    content: translated.content,
                };
                
                await wpApi.post(`/${endpoint}/${postId}`, payload);
                results.success.push(lang.toUpperCase());

            } catch (error: any) {
                console.error(`Failed to sync FULL CONTENT for lang ${lang} (post ${postId}):`, error.response?.data || error.message);
                results.failed.push({ lang, reason: error.response?.data?.message || 'Unknown error' });
            }
        }

        const message = `Sincronización de contenido completada. Éxito: ${results.success.length > 0 ? results.success.join(', ') : 'ninguno'}. Fallos: ${results.failed.length}.`;
        
        return NextResponse.json({ success: true, message, results });

    } catch (error: any) {
        console.error("Error in sync-full-content endpoint:", error);
        return NextResponse.json({ error: "Failed to sync full content translations", message: error.message }, { status: 500 });
    }
}
