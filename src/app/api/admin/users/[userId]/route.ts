
// src/app/api/admin/users/[userId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function isAdmin(req: NextRequest): Promise<{ isAdmin: boolean, uid: string | null, role: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return { isAdmin: false, uid: null, role: null };
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        const role = userDoc.data()?.role;
        const isUserAdmin = userDoc.exists && ['admin', 'super_admin'].includes(role);
        return { isAdmin: isUserAdmin, uid: decodedToken.uid, role };
    } catch {
        return { isAdmin: false, uid: null, role: null };
    }
}


export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
    const { isAdmin: isRequestingAdmin, uid: adminUid, role: adminRole } = await isAdmin(req);
    if (!isRequestingAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    
    if (!adminDb || !adminAuth) {
        return NextResponse.json({ error: 'Firebase Admin not configured' }, { status: 503 });
    }

    const { userId } = params;
    
    if (!userId) {
        return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    if (userId === adminUid) {
        return NextResponse.json({ error: 'Admins cannot delete their own account.' }, { status: 400 });
    }

    const targetUserDoc = await adminDb.collection('users').doc(userId).get();
    if (!targetUserDoc.exists) {
        try {
            await adminAuth.deleteUser(userId);
        } catch (authError: any) {
            if (authError.code !== 'auth/user-not-found') {
                 console.error(`Error deleting user ${userId} from Auth:`, authError);
            }
        }
        return NextResponse.json({ success: true, message: 'User not found in database, deletion command sent to Auth service.' });
    }

    const targetUserRole = targetUserDoc.data()?.role;
    if (adminRole === 'admin' && (targetUserRole === 'admin' || targetUserRole === 'super_admin')) {
         return NextResponse.json({ error: 'Admins cannot delete other admins or super admins.' }, { status: 403 });
    }
    if (targetUserRole === 'super_admin' && adminRole !== 'super_admin') {
         return NextResponse.json({ error: 'Only a Super Admin can delete another Super Admin.' }, { status: 403 });
    }
    
    try {
        const batch = adminDb.batch();
        
        const userRef = adminDb.collection('users').doc(userId);
        const userSettingsRef = adminDb.collection('user_settings').doc(userId);
        
        const userData = targetUserDoc.data();
        if (userData?.apiKey) {
            const apiKeyRef = adminDb.collection('api_keys').doc(userData.apiKey);
            batch.delete(apiKeyRef);
        }

        const activityLogsQuery = adminDb.collection('activity_logs').where('userId', '==', userId);
        const activityLogsSnapshot = await activityLogsQuery.get();
        activityLogsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        batch.delete(userRef);
        batch.delete(userSettingsRef);
        
        await batch.commit();
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
