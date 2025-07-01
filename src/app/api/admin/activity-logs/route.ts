
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

export async function GET(req: NextRequest) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        // 1. Fetch all users and create a map
        const usersSnapshot = await adminDb.collection('users').get();
        const usersMap = new Map<string, any>();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            usersMap.set(doc.id, {
                displayName: data.displayName || 'No Name',
                email: data.email || '',
                photoURL: data.photoURL || '',
            });
        });

        // 2. Fetch all activity logs, limited to the most recent 200 for performance
        const logsSnapshot = await adminDb.collection('activity_logs').limit(200).get();
        
        // 3. Combine logs with user data
        const logs = logsSnapshot.docs.map(doc => {
            const logData = doc.data();
            const user = usersMap.get(logData.userId) || { displayName: 'Usuario Eliminado', email: '', photoURL: '' };
            return {
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp.toDate().toISOString(),
                user: user
            };
        });

        return NextResponse.json({ logs });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: errorMessage }, { status: 500 });
    }
}
