
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// Helper to get admin context from the request
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
    
    // Authorization check
    if (!adminContext.role || !['admin', 'super_admin'].includes(adminContext.role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        // Step 1: Fetch all companies to map their names
        const companiesSnapshot = await adminDb.collection('companies').get();
        const companiesMap = new Map<string, string>();
        companiesSnapshot.forEach(doc => {
            companiesMap.set(doc.id, doc.data().name);
        });

        // Step 2: Fetch all users to create a detailed user map
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

        // Step 3: Fetch the 200 most recent activity logs
        const logsSnapshot = await adminDb.collection('activity_logs').orderBy('timestamp', 'desc').limit(200).get();
        
        // Step 4: Map logs to include user details, creating an enriched list
        const allEnrichedLogs = logsSnapshot.docs.map(doc => {
            const logData = doc.data();
            // Use the user map, providing a fallback for deleted users
            const user = usersMap.get(logData.userId) || { displayName: 'Usuario Eliminado', email: '', photoURL: '', companyId: null, companyName: null };
            return {
                id: doc.id,
                ...logData,
                timestamp: logData.timestamp.toDate().toISOString(),
                user: user
            };
        });

        // Step 5: Filter the enriched logs based on the admin's role
        const filteredLogs = allEnrichedLogs.filter(log => {
            // Super admins see all logs
            if (adminContext.role === 'super_admin') {
                return true;
            }
            
            if (adminContext.role === 'admin') {
                // If the admin has a company, they see all logs from that company.
                if (adminContext.companyId) {
                    return log.user.companyId === adminContext.companyId;
                }
                // If the admin has NO company, they only see their OWN logs.
                return log.userId === adminContext.uid;
            }
            
            // Should not be reached due to initial auth check, but as a safeguard:
            return false;
        });

        return NextResponse.json({ logs: filteredLogs });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: errorMessage }, { status: 500 });
    }
}
