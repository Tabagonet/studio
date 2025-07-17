
// src/app/api/user/activity-logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function getUserContext(req: NextRequest): Promise<{ uid: string | null; role: string | null; companyId: string | null; }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return { uid: null, role: null, companyId: null };
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized.");
        if (!adminDb) throw new Error("Firestore not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) {
            return { uid: decodedToken.uid, role: null, companyId: null };
        }
        const data = userDoc.data()!;
        return {
            uid: decodedToken.uid,
            role: data.role || null,
            companyId: data.companyId || null,
        };
    } catch {
        return { uid: null, role: null, companyId: null };
    }
}

export async function GET(req: NextRequest) {
    const context = await getUserContext(req);
    if (!context.uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        // Corrected and simplified query logic
        const query = adminDb.collection('activity_logs').where('userId', '==', context.uid);

        const snapshot = await query.orderBy('timestamp', 'desc').limit(200).get();
        
        const logs = snapshot.docs.map(doc => {
            const logData = doc.data();
            return {
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp.toDate().toISOString(),
            };
        });
        
        return NextResponse.json({ logs });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching user activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: errorMessage }, { status: 500 });
    }
}
