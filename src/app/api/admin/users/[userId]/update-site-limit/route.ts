
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
        const role = userDoc.data()?.role;
        return userDoc.exists && ['admin', 'super_admin'].includes(role);
    } catch { return false; }
}

const updateSiteLimitSchema = z.object({
  siteLimit: z.number().int().min(0, "El límite debe ser 0 o mayor."),
});

export async function POST(req: NextRequest, { params }: { params: { userId: string } }) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
    }

    const { userId } = params;
    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    try {
        const body = await req.json();
        const validation = updateSiteLimitSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { siteLimit } = validation.data;
        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.update({ siteLimit });
        
        return NextResponse.json({ success: true, message: `El límite de sitios para el usuario ${userId} ha sido actualizado a ${siteLimit}.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error updating site limit for user ${userId}:`, error);
        return NextResponse.json({ error: 'Failed to update site limit', details: errorMessage }, { status: 500 });
    }
}
