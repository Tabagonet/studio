
// src/app/api/woocommerce/products/batch/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const batchActionSchema = z.object({
  productIds: z.array(z.number()).min(1, 'At least one product ID is required.'),
  action: z.enum(['delete']), // Can be extended later for other actions
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
        const { productIds, action } = validation.data;

        const { wooApi } = await getApiClientsForUser(uid);
        if (!wooApi) {
            throw new Error('WooCommerce API is not configured for the active connection.');
        }

        let batchData: any = {};
        if (action === 'delete') {
            batchData.delete = productIds;
        }

        const response = await wooApi.post('products/batch', batchData);
        
        const deletedCount = response.data.delete?.length || 0;
        const failedCount = productIds.length - deletedCount;
        let message = `Proceso completado. ${deletedCount} producto(s) eliminado(s).`;
        if (failedCount > 0) {
            message += ` ${failedCount} fallido(s).`;
        }
        
        return NextResponse.json({
            message: message,
            data: response.data,
        });

    } catch (error: any) {
        console.error('Error in product batch action API:', error.response?.data || error);
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.response?.data?.message || error.message }, { status });
    }
}
