
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function getAdminContext(req: NextRequest): Promise<{ uid: string | null; role: string | null; }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return { uid: null, role: null };
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) return { uid: decodedToken.uid, role: null };
        return { uid: decodedToken.uid, role: userDoc.data()!.role || null };
    } catch {
        return { uid: null, role: null };
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const adminContext = await getAdminContext(req);
    const isAuthorized = adminContext.role === 'admin' || adminContext.role === 'super_admin';
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { id: prospectId } = params;
    if (!prospectId) {
        return NextResponse.json({ error: 'Prospect ID is required' }, { status: 400 });
    }

    try {
        const prospectRef = adminDb.collection('prospects').doc(prospectId);
        await prospectRef.delete();

        return NextResponse.json({ success: true, message: 'Prospect deleted successfully.' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error deleting prospect ${prospectId}:`, error);
        return NextResponse.json({ error: 'Failed to delete prospect', details: errorMessage }, { status: 500 });
    }
}
