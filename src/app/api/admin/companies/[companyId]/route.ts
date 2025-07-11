import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function isSuperAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'super_admin';
    } catch {
        return false;
    }
}

// DELETE handler
export async function DELETE(req: NextRequest, { params }: { params: { companyId: string } }) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { companyId } = params;
    if (!companyId) {
        return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const companyRef = adminDb.collection('companies').doc(companyId);

    try {
        // Find users associated with this company
        const usersToUpdateSnapshot = await adminDb.collection('users').where('companyId', '==', companyId).get();
        
        const batch = adminDb.batch();

        // Un-assign users from the company
        usersToUpdateSnapshot.forEach(doc => {
            batch.update(doc.ref, { companyId: null });
        });

        // Delete the company document
        batch.delete(companyRef);
        
        await batch.commit();
        
        return NextResponse.json({ success: true, message: `La empresa y sus asignaciones de usuario han sido eliminadas.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: 'Failed to delete company', details: errorMessage }, { status: 500 });
    }
}
