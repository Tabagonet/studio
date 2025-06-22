
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const BatchStatusUpdateSchema = z.object({
  productIds: z.array(z.number()).min(1, 'At least one product ID is required.'),
  status: z.enum(['publish', 'draft']),
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
        const validation = BatchStatusUpdateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        const { productIds, status } = validation.data;

        const { wooApi } = await getApiClientsForUser(uid);

        const batchData = {
            update: productIds.map(id => ({
                id,
                status,
            })),
        };

        const response = await wooApi.post('products/batch', batchData);
        
        const updatedCount = response.data.update?.length || 0;
        const failedCount = productIds.length - updatedCount;

        return NextResponse.json({
            message: `Proceso completado. ${updatedCount} producto(s) actualizado(s), ${failedCount} fallido(s).`,
            data: response.data,
        });

    } catch (error: any) {
        console.error('Error in batch status update API:', error.response?.data || error);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.response?.data?.message || error.message }, { status: 500 });
    }
}
