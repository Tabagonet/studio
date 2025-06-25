
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
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }

        const results = {
            success: [] as number[],
            failed: [] as { id: number; reason: string }[],
        };

        if (action === 'delete') {
            const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
            if (!siteUrl) {
                throw new Error("Could not determine base site URL.");
            }

            for (const postId of postIds) {
                try {
                    // Use the new custom endpoint for trashing
                    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/trash-post/${postId}`;
                    await wpApi.post(customEndpointUrl);
                    results.success.push(postId);
                } catch (error: any) {
                    let reason = error.response?.data?.message || error.message || 'Unknown error';
                     if (error.response?.status === 404) {
                        reason = 'Endpoint de borrado no encontrado. Asegúrate de que el plugin personalizado está activo y actualizado en WordPress.';
                    }
                    results.failed.push({ id: postId, reason });
                }
            }
        }
        
        const successCount = results.success.length;
        const failedCount = results.failed.length;
        let message = `Proceso completado. ${successCount} entrada(s) movida(s) a la papelera.`;
        if (failedCount > 0) {
            message += ` ${failedCount} fallida(s).`;
        }

        return NextResponse.json({ message, results });

    } catch (error: any) {
        console.error('Error in blog batch action API:', error);
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.message }, { status });
    }
}
