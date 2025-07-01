
// src/app/api/admin/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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


export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (!adminDb || !adminAuth) {
        return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
    }

    const { userId } = params;
    const requestingUid = req.headers.get('x-decoded-uid'); // Assume a middleware might add this
    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (userId === requestingUid) {
        return NextResponse.json({ error: 'Admins cannot delete their own account.' }, { status: 400 });
    }
    
    try {
        const batch = adminDb.batch();
        
        // References to the user's main data
        const userRef = adminDb.collection('users').doc(userId);
        const userSettingsRef = adminDb.collection('user_settings').doc(userId);
        
        // Find and add user's activity logs to the batch for deletion
        const activityLogsQuery = adminDb.collection('activity_logs').where('userId', '==', userId);
        const activityLogsSnapshot = await activityLogsQuery.get();
        activityLogsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        // Add user documents to the batch
        batch.delete(userRef);
        batch.delete(userSettingsRef);
        
        // First, commit all database deletions
        await batch.commit();

        // Then, delete the user from Firebase Auth
        await adminAuth.deleteUser(userId);

        return NextResponse.json({ success: true, message: `User ${userId} and all associated data have been deleted.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error deleting user ${userId}:`, error);
        
        if ((error as any).code === 'auth/user-not-found') {
            return NextResponse.json({ success: true, message: 'User already deleted from Auth, DB records cleaned up.' });
        }

        return NextResponse.json({ error: 'Failed to delete user', details: errorMessage }, { status: 500 });
    }
}
