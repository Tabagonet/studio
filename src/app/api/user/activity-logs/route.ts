
// src/app/api/user/activity-logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function getUserContext(req: NextRequest): Promise<{ uid: string | null; role: string | null; companyId: string | null; }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return { uid: null, role: null, companyId: null };
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
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
        let logsQuery = adminDb.collection('activity_logs');
        let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData>;

        if (context.role === 'super_admin') {
            // Super admin gets all logs
            query = logsQuery;
        } else if (context.role === 'admin' && context.companyId) {
            // Admin gets logs for all users in their company
            const usersSnapshot = await adminDb.collection('users').where('companyId', '==', context.companyId).get();
            const userIds = usersSnapshot.docs.map(doc => doc.id);

            if (userIds.length === 0) {
                 return NextResponse.json({ logs: [] });
            }
            // Firestore 'in' query is limited to 30 items per query.
            if (userIds.length > 30) {
                 console.warn(`Company ${context.companyId} has more than 30 users. Activity log query will be truncated.`);
                 // We will query for the first 30, this is a known limitation to be addressed if needed.
            }
            query = logsQuery.where('userId', 'in', userIds.slice(0, 30));
        } else {
            // Regular user gets only their own logs
            query = logsQuery.where('userId', '==', context.uid);
        }
        
        const logsSnapshot = await query.orderBy('timestamp', 'desc').limit(200).get();
        
        const logs = logsSnapshot.docs.map(doc => {
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
