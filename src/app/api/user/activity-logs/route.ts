// src/app/api/user/activity-logs/route.ts
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

export async function GET(req: NextRequest) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const logsSnapshot = await adminDb.collection('activity_logs')
            .where('userId', '==', uid)
            .orderBy('timestamp', 'desc')
            .limit(100) // Limit to a reasonable number for the dashboard
            .get();
        
        const logs = logsSnapshot.docs.map(doc => {
            const logData = doc.data();
            return {
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp.toDate().toISOString(),
            };
        });
        
        return NextResponse.json({ logs });

    } catch (error: any) {
        console.error("Error fetching user activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: error.message }, { status: 500 });
    }
}
