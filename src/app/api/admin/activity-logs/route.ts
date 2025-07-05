
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function getAdminContext(req: NextRequest): Promise<{ uid: string | null; role: string | null; companyId: string | null }> {
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
    const adminContext = await getAdminContext(req);
    const isAuthorized = adminContext.role === 'admin' || adminContext.role === 'super_admin';
    
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        // 1. Fetch all companies and create a map
        const companiesSnapshot = await adminDb.collection('companies').get();
        const companiesMap = new Map<string, string>();
        companiesSnapshot.forEach(doc => {
            companiesMap.set(doc.id, doc.data().name);
        });

        // 2. Fetch all users and create a map with company info
        const usersSnapshot = await adminDb.collection('users').get();
        const usersMap = new Map<string, any>();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const companyId = data.companyId || null;
            usersMap.set(doc.id, {
                displayName: data.displayName || 'No Name',
                email: data.email || '',
                photoURL: data.photoURL || '',
                companyId: companyId,
                companyName: companyId ? (companiesMap.get(companyId) || null) : null
            });
        });

        // 3. Fetch all activity logs, limited to the most recent 200 for performance
        const logsSnapshot = await adminDb.collection('activity_logs').orderBy('timestamp', 'desc').limit(200).get();
        
        // 4. Combine logs with user data and then filter based on role
        const logs = logsSnapshot.docs.map(doc => {
            const logData = doc.data();
            const user = usersMap.get(logData.userId) || { displayName: 'Usuario Eliminado', email: '', photoURL: '', companyId: null, companyName: null };
            return {
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp.toDate().toISOString(),
                user: user
            };
        }).filter(log => {
            // If the user is a super_admin, they see everything.
            if (adminContext.role === 'super_admin') {
                return true;
            }
            // If the user is a regular admin, they only see logs from their own company.
            return log.user.companyId === adminContext.companyId;
        });

        return NextResponse.json({ logs });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: errorMessage }, { status: 500 });
    }
}
