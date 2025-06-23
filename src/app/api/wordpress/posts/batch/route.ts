
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const batchActionSchema = z.object({
  postIds: z.array(z.number()).min(1, 'At least one post ID is required.'),
  action: z.enum(['delete']), // Can be extended later for status updates etc.
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
        const validation = batchActionSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        const { postIds, action } = validation.data;

        const { wpApi } = await getApiClientsForUser(uid);

        const results = {
            success: [] as number[],
            failed: [] as { id: number; reason: string }[],
        };

        if (action === 'delete') {
            for (const postId of postIds) {
                try {
                    // force: true permanently deletes
                    await wpApi.delete(`/posts/${postId}`, { params: { force: true } });
                    results.success.push(postId);
                } catch (error: any) {
                    results.failed.push({ id: postId, reason: error.response?.data?.message || error.message || 'Unknown error' });
                }
            }
        }
        
        const successCount = results.success.length;
        const failedCount = results.failed.length;
        let message = `Proceso completado. ${successCount} entrada(s) eliminada(s).`;
        if (failedCount > 0) {
            message += ` ${failedCount} fallida(s).`;
        }

        return NextResponse.json({ message, results });

    } catch (error: any) {
        console.error('Error in blog batch action API:', error);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.message }, { status: 500 });
    }
}
