
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ActivityLog } from '@/lib/types';

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
        // Step 1: Fetch all companies to map their names, platforms, and AI usage
        const companiesSnapshot = await adminDb.collection('companies').get();
        const companiesMap = new Map<string, { name: string, platform: string | null, aiUsageCount: number }>();
        companiesSnapshot.forEach(doc => {
            const data = doc.data();
            companiesMap.set(doc.id, {
                name: data.name,
                platform: data.platform || null,
                aiUsageCount: data.aiUsageCount || 0
            });
        });

        // Step 2: Fetch all users to create a detailed user map, including individual AI usage
        const usersSnapshot = await adminDb.collection('users').get();
        const userSettingsSnapshot = await adminDb.collection('user_settings').get();
        const userSettingsMap = new Map<string, { aiUsageCount: number }>();
        userSettingsSnapshot.forEach(doc => {
            userSettingsMap.set(doc.id, { aiUsageCount: doc.data().aiUsageCount || 0 });
        });

        const usersMap = new Map<string, any>();
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const companyId = data.companyId || null;
            const companyInfo = companyId ? companiesMap.get(companyId) : null;
            
            const aiUsageCount = companyInfo 
                ? companyInfo.aiUsageCount 
                : (userSettingsMap.get(doc.id)?.aiUsageCount || 0);

            usersMap.set(doc.id, {
                displayName: data.displayName || 'No Name',
                email: data.email || '',
                photoURL: data.photoURL || '',
                companyId: companyId,
                companyName: companyInfo ? companyInfo.name : null,
                platform: companyInfo ? companyInfo.platform : (data.platform || null),
                aiUsageCount: aiUsageCount
            });
        });

        // Step 3: Fetch activity logs based on role
        let logsQuery = adminDb.collection('activity_logs').orderBy('timestamp', 'desc');

        if (adminContext.role === 'admin' && adminContext.companyId) {
            // Get all user IDs belonging to the admin's company
            const companyUsersSnapshot = await adminDb.collection('users').where('companyId', '==', adminContext.companyId).get();
            const companyUserIds = companyUsersSnapshot.docs.map(doc => doc.id);
            
            if (companyUserIds.length > 0) {
                 // Firestore 'in' queries are limited to 30 elements
                if (companyUserIds.length <= 30) {
                    logsQuery = logsQuery.where('userId', 'in', companyUserIds);
                }
            } else {
                // If company has no users, return empty logs
                 return NextResponse.json({ logs: [] });
            }
        } else if (adminContext.role === 'admin' && !adminContext.companyId) {
             // Admin without a company only sees their own logs
             logsQuery = logsQuery.where('userId', '==', adminContext.uid);
        }

        const logsSnapshot = await logsQuery.limit(200).get();
        
        // Step 4: Map logs to include user details, creating an enriched list
        let enrichedLogs: ActivityLog[] = logsSnapshot.docs.map(doc => {
            const logData = doc.data();
            const user = usersMap.get(logData.userId) || { displayName: 'Usuario Eliminado', email: '', photoURL: '', companyId: null, companyName: null, platform: null, aiUsageCount: 0 };
            return {
                id: doc.id,
                userId: logData.userId,
                action: logData.action,
                details: logData.details,
                timestamp: logData.timestamp.toDate().toISOString(),
                user: user
            };
        });

        // In-memory filter if the 'in' query was too large
        if (adminContext.role === 'admin' && adminContext.companyId) {
            const companyUserIdsSet = new Set(usersMap.keys());
            enrichedLogs = enrichedLogs.filter(log => companyUserIdsSet.has(log.userId));
        }

        return NextResponse.json({ logs: enrichedLogs });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching activity logs:", error);
        return NextResponse.json({ error: 'Failed to fetch activity logs', details: errorMessage }, { status: 500 });
    }
}
