
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

        // We need to update each post in the group with the complete translation mapping.
        const updatePromises = postIds.map(postId => {
            return wpApi.post(`/posts/${postId}`, { translations });
        });

        await Promise.all(updatePromises);
        
        return NextResponse.json({
            success: true,
            message: `${postIds.length} entradas han sido enlazadas correctamente como traducciones.`,
        });

    } catch (error: any) {
        console.error('Error linking translations:', error.response?.data || error.message);
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ 
            error: 'An unexpected error occurred during the linking process.', 
            message: error.response?.data?.message || error.message 
        }, { status });
    }
}
