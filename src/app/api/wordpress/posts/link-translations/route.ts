
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

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

        // Generate a new, single group ID for all posts being linked.
        const translationGroupId = uuidv4();

        // Create an array of promises to update each post.
        const updatePromises = Object.entries(translations).map(([lang, postId]) => {
            const payload = {
                meta: {
                    translation_group_id: translationGroupId,
                },
                // Also ensure the language is correctly set on the post, just in case.
                lang: lang,
            };
            console.log(`[link-translations] Updating post ID ${postId} with lang '${lang}' and group ID '${translationGroupId}'`);
            return wpApi.post(`/posts/${postId}`, payload);
        });

        // Use Promise.allSettled to wait for all updates and handle individual failures.
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
