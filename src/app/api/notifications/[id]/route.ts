
// src/app/api/notifications/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return null;
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken.uid;
    } catch {
        return null;
    }
}


export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { id: notificationId } = params;
    if (!notificationId) {
        return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    try {
        const notificationRef = adminDb.collection('notifications').doc(notificationId);
        const doc = await notificationRef.get();

        if (!doc.exists) {
            return NextResponse.json({ success: true, message: 'Notification already deleted.' });
        }

        // Security check: ensure the user is deleting their own notification
        if (doc.data()?.recipientUid !== uid) {
            return NextResponse.json({ error: 'Forbidden: You can only delete your own notifications.' }, { status: 403 });
        }

        await notificationRef.delete();

        return NextResponse.json({ success: true, message: 'Notification deleted successfully.' });

    } catch (error: any) {
        console.error(`Error deleting notification ${notificationId}:`, error);
        return NextResponse.json({ error: 'Failed to delete notification', details: error.message }, { status: 500 });
    }
}
