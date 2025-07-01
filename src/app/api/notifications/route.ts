
// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

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

// GET handler to fetch notifications for the authenticated user
export async function GET(req: NextRequest) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const notificationsSnapshot = await adminDb.collection('notifications')
            .where('recipientUid', '==', uid)
            .limit(50) // Limit to last 50 notifications for performance
            .get();
        
        const notifications = notificationsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                // Add a fallback for createdAt to prevent server errors
                createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : new Date(0).toISOString(),
            };
        });
        
        return NextResponse.json({ notifications });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching notifications:", error);
        return NextResponse.json({ error: 'Failed to fetch notifications', details: errorMessage }, { status: 500 });
    }
}

// POST handler to mark all of a user's notifications as read
export async function POST(req: NextRequest) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
     if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const unreadNotificationsSnapshot = await adminDb.collection('notifications')
            .where('recipientUid', '==', uid)
            .where('read', '==', false)
            .get();

        if (unreadNotificationsSnapshot.empty) {
            return NextResponse.json({ success: true, message: 'No unread notifications to mark.' });
        }

        const batch = adminDb.batch();
        unreadNotificationsSnapshot.docs.forEach(doc => {
            batch.update(doc.ref, { read: true });
        });
        await batch.commit();

        return NextResponse.json({ success: true, message: `${unreadNotificationsSnapshot.size} notifications marked as read.` });

    } catch (error) {
         const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
         console.error("Error marking notifications as read:", error);
        return NextResponse.json({ error: 'Failed to mark notifications as read', details: errorMessage }, { status: 500 });
    }
}
