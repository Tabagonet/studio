
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

        if (Object.keys(translations).length < 2) {
            return NextResponse.json({ error: 'At least two posts are required to link.' }, { status: 400 });
        }

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }

        // The key is to update EACH post with the full list of all other translations.
        // Polylang will then create the term in its hidden taxonomy and assign it.
        const updatePromises = Object.entries(translations).map(([lang, postId]) => {
            const payload = {
                // The 'translations' property is what Polylang uses.
                translations: translations, 
            };
            console.log(`[link-translations] Updating post ID ${postId} with translations object:`, JSON.stringify(payload));
            // WordPress uses POST to the ID endpoint for updates.
            return wpApi.post(`/posts/${postId}`, payload);
        });
        
        const results = await Promise.allSettled(updatePromises);
        
        let successCount = 0;
        const errors: string[] = [];

        results.forEach((result, index) => {
            const postId = Object.values(translations)[index];
            if (result.status === 'fulfilled') {
                console.log(`[link-translations] Successfully updated post ${postId}.`);
                successCount++;
            } else {
                const errorReason = result.reason.response?.data?.message || result.reason.message || 'Unknown error';
                console.error(`[link-translations] Failed to update post ${postId}:`, errorReason);
                errors.push(`Post ${postId}: ${errorReason}`);
            }
        });
        
        if (errors.length > 0) {
            // Check for a specific Polylang error
            const commonError = errors[0];
            if (commonError.includes('rest_invalid_param') && commonError.includes('translations')) {
                throw new Error("Failed to link translations. Your WordPress site might be missing the Polylang REST API support. Please ensure Polylang is active and correctly configured.");
            }
            throw new Error(`Failed to link some translations. Errors: ${errors.join(', ')}`);
        }


        return NextResponse.json({
            success: true,
            message: `${successCount} entradas han sido enlazadas correctamente como traducciones.`,
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
