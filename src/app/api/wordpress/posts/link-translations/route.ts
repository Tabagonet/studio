
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const linkSchema = z.object({
  translations: z.record(z.string(), z.number()), // e.g. { "en": 123, "es": 456 }
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = linkSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { translations } = validation.data;
        const postIds = Object.values(translations);

        if (postIds.length < 2) {
            return NextResponse.json({ error: 'At least two posts are required to link.' }, { status: 400 });
        }

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }

        const updatePromises = postIds.map(postId => {
            const payload = {
                translations: translations,
            };
            console.log(`[link-translations] Updating post ID ${postId} with payload:`, JSON.stringify(payload));
            return wpApi.post(`/posts/${postId}`, payload);
        });

        // Use Promise.allSettled to see all results, even if some fail
        const results = await Promise.allSettled(updatePromises);
        
        let allSucceeded = true;
        results.forEach((result, index) => {
            const postId = postIds[index];
            if (result.status === 'fulfilled') {
                const updatedPost = result.value.data;
                // CRUCIAL CHECK: Verify that WordPress actually applied the change.
                const updatedTranslations = updatedPost.translations || {};
                const sentKeys = Object.keys(translations);
                const receivedKeys = Object.keys(updatedTranslations);
                
                // A simple length check is a good indicator of success.
                if (receivedKeys.length < sentKeys.length) {
                    console.error(`[link-translations] Mismatch for post ${postId}. WP may have ignored the field. Sent:`, translations, "Received:", updatedTranslations);
                    allSucceeded = false;
                } else {
                    console.log(`[link-translations] Successfully updated post ${postId}.`);
                }
            } else {
                console.error(`[link-translations] Failed to update post ${postId}:`, result.reason.response?.data || result.reason.message);
                allSucceeded = false;
            }
        });
        
        if (!allSucceeded) {
            throw new Error('Algunas traducciones no se pudieron enlazar. Esto puede deberse a la configuración de Polylang en tu WordPress o a un problema de permisos del usuario de la API.');
        }

        return NextResponse.json({
            success: true,
            message: `${postIds.length} entradas han sido enlazadas correctamente como traducciones.`,
        });

    } catch (error: any) {
        console.error('Error linking translations:', error.response?.data || error.message);
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ 
            error: 'An unexpected error occurred during the linking process.', 
            message: error.message 
        }, { status });
    }
}
