

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const batchActionSchema = z.object({
  postIds: z.array(z.number()).min(1, 'At least one post ID is required.'),
  action: z.enum(['delete', 'update']),
  updates: z.object({
      categories: z.array(z.number()).optional(),
      status: z.enum(['publish', 'draft']).optional(),
  }).optional(),
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
        const { postIds, action, updates } = validation.data;

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }
        
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) {
            throw new Error("Could not determine base site URL.");
        }

        if (action === 'delete') {
            const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/batch-trash-posts`;
            const response = await wpApi.post(customEndpointUrl, { post_ids: postIds });
            const resultData = response.data.data;

            const successCount = resultData.success?.length || 0;
            const failedCount = resultData.failed?.length || 0;
            let message = `Proceso completado. ${successCount} elemento(s) movido(s) a la papelera.`;
            if (failedCount > 0) {
                message += ` ${failedCount} fallido(s).`;
            }
            return NextResponse.json({ message, results: resultData });
        } else if (action === 'update' && updates?.status) {
             const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/batch-update-status`;
             const response = await wpApi.post(customEndpointUrl, { post_ids: postIds, status: updates.status });
             const resultData = response.data.data;
             const successCount = resultData.success?.length || 0;
             const failedCount = resultData.failed?.length || 0;
             let message = `Proceso completado. ${successCount} elemento(s) actualizado(s).`;
             if (failedCount > 0) {
                 message += ` ${failedCount} fallido(s).`;
             }
             return NextResponse.json({ message, results: resultData });
        } else {
             return NextResponse.json({ error: 'Action not implemented or invalid for this endpoint' }, { status: 400 });
        }

    } catch (error: any) {
        console.error('Error in blog batch action API:', error.response?.data || error.message);
        let errorMessage = error.response?.data?.message || error.message || 'An unexpected error occurred during batch processing.';
        if (error.response?.status === 404) {
             errorMessage = 'Endpoint no encontrado. Por favor, actualiza el plugin personalizado en WordPress a la última versión.';
        }
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ error: errorMessage }, { status });
    }
}
