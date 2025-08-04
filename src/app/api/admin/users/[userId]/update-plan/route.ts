

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

async function isSuperAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin Auth not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'super_admin';
    } catch {
        return false;
    }
}

const updatePlanSchema = z.object({
  plan: z.enum(['lite', 'pro', 'agency']),
});

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { userId } = params;
    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    try {
        const body = await req.json();
        const validation = updatePlanSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { plan } = validation.data;
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.update({ plan });
        
        return NextResponse.json({ success: true, message: `El plan del usuario ha sido actualizado a ${plan}.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error updating plan for user ${userId}:`, error);
        return NextResponse.json({ error: 'Failed to update user plan', details: errorMessage }, { status: 500 });
    }
}
