
// src/app/api/admin/users/[userId]/update-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

async function isAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch { return false; }
}

const updateStatusSchema = z.object({
  status: z.enum(['active', 'rejected']),
});

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
    if (!await isAdmin(req)) {
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
        const validation = updateStatusSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { status } = validation.data;
        const userRef = adminDb.collection('users').doc(userId);
        
        const updateData: { status: string; role?: string } = { status };
        
        // If we are activating a user, also set their role to 'user'
        if (status === 'active') {
            updateData.role = 'user';
        }

        await userRef.update(updateData);
        
        return NextResponse.json({ success: true, message: `User ${userId} status updated to ${status}.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error updating user ${userId}:`, error);
        return NextResponse.json({ error: 'Failed to update user status', details: errorMessage }, { status: 500 });
    }
}
