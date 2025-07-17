
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

async function isSuperAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth not initialized.");
        if (!adminDb) throw new Error("Firestore is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'super_admin';
    } catch {
        return false;
    }
}

const updatePlatformSchema = z.object({
  platform: z.enum(['woocommerce', 'shopify']).nullable(),
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
        const validation = updatePlatformSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { platform } = validation.data;
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.update({ platform });
        
        return NextResponse.json({ success: true, message: `La plataforma del usuario ha sido actualizada.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error updating platform for user ${userId}:`, error);
        return NextResponse.json({ error: 'Failed to update user platform', details: errorMessage }, { status: 500 });
    }
}
