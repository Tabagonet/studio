
// src/app/api/admin/users/[userId]/update-role/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

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

const updateRoleSchema = z.object({
  role: z.enum(['admin', 'user']),
});

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb || !adminAuth) {
        return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
    }

    const { userId } = params;
    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    try {
        const body = await req.json();
        const validation = updateRoleSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { role } = validation.data;
        const userRef = adminDb.collection('users').doc(userId);

        // Set custom claims for role-based access control
        await adminAuth.setCustomUserClaims(userId, { role });
        
        // Update the role in Firestore as well for UI purposes
        await userRef.update({ role });
        
        return NextResponse.json({ success: true, message: `User ${userId} role updated to ${role}.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error updating role for user ${userId}:`, error);
        return NextResponse.json({ error: 'Failed to update user role', details: errorMessage }, { status: 500 });
    }
}
