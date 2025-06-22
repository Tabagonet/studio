
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';

const updateStatusSchema = z.object({
  status: z.enum(['publish', 'draft', 'pending', 'private']),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const body = await req.json();
    const validationResult = updateStatusSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid status provided.', details: validationResult.error.flatten() }, { status: 400 });
    }

    const { status } = validationResult.data;
    
    const response = await wooApi.put(`products/${productId}`, {
      status: status,
    });

    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error updating product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update product status.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
