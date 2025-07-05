
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
        const role = userDoc.data()?.role;
        return userDoc.exists && ['admin', 'super_admin'].includes(role);
    } catch { return false; }
}

export async function DELETE(req: NextRequest) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        // 1. Get all valid user IDs
        const usersSnapshot = await adminDb.collection('users').select().get();
        const validUserIds = new Set(usersSnapshot.docs.map(doc => doc.id));

        // 2. Query all activity logs
        // Note: For very large collections, this read could be expensive.
        // An alternative would be a more complex, paginated check. For now, this is direct.
        const logsSnapshot = await adminDb.collection('activity_logs').get();
        
        const orphanLogsRefs: FirebaseFirestore.DocumentReference[] = [];

        logsSnapshot.forEach(doc => {
            const logData = doc.data();
            // If the log's userId is not in our set of valid user IDs, it's an orphan.
            if (logData.userId && !validUserIds.has(logData.userId)) {
                orphanLogsRefs.push(doc.ref);
            }
        });
        
        if (orphanLogsRefs.length === 0) {
            return NextResponse.json({ success: true, message: 'No se encontraron registros de actividad huérfanos.' });
        }

        // 3. Delete orphan logs in batches
        const batchPromises = [];
        for (let i = 0; i < orphanLogsRefs.length; i += 500) {
            const batch = adminDb.batch();
            const chunk = orphanLogsRefs.slice(i, i + 500);
            chunk.forEach(ref => {
                batch.delete(ref);
            });
            batchPromises.push(batch.commit());
        }

        await Promise.all(batchPromises);

        return NextResponse.json({ success: true, message: `Se eliminaron ${orphanLogsRefs.length} registros huérfanos.` });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error cleaning up orphan activity logs:", error);
        return NextResponse.json({ error: 'Failed to clean up logs', details: errorMessage }, { status: 500 });
    }
}
