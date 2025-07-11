
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function getUserIdFromRequest(req: NextRequest): Promise<string> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken.uid;
}

// Helper to delete all documents in a query in batches
async function deleteQueryBatch(db: FirebaseFirestore.Firestore, query: FirebaseFirestore.Query, resolve: (value: unknown) => void, reject: (reason?: any) => void) {
  try {
    const snapshot = await query.limit(500).get(); // Firestore batch limit is 500
    
    if (snapshot.size === 0) {
        resolve(true);
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();

    // Recurse on the same query to process next batch
    process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, reject);
    });
  } catch(error) {
    reject(error);
  }
}


export async function DELETE(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        
        // --- Delete Activity Logs ---
        const activityQuery = adminDb.collection('activity_logs').where('userId', '==', uid);
        await new Promise((resolve, reject) => deleteQueryBatch(adminDb!, activityQuery, resolve, reject));
        
        // --- Delete Notifications ---
        const notificationsQuery = adminDb.collection('notifications').where('recipientUid', '==', uid);
        await new Promise((resolve, reject) => deleteQueryBatch(adminDb!, notificationsQuery, resolve, reject));

        return NextResponse.json({ success: true, message: 'Your activity logs and notifications have been cleared.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error cleaning up user data:', error);
        const status = errorMessage.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: errorMessage || 'Failed to clean up data' }, { status });
    }
}
