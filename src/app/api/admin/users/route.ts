// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Company, User } from '@/lib/types';

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
    } catch (error) {
        console.error("Admin context check failed:", error);
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
        const companiesSnapshot = await adminDb.collection('companies').get();
        const companiesMap = new Map<string, Company>();
        companiesSnapshot.forEach(doc => {
            const data = doc.data();
            companiesMap.set(doc.id, {
                id: doc.id,
                name: data.name,
                platform: data.platform || 'woocommerce',
                plan: data.plan || 'lite',
                createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString(),
                aiUsageCount: data.aiUsageCount || 0,
                connections: data.connections || {}, // NEW: Include connections
            });
        });

        const userSettingsSnapshot = await adminDb.collection('user_settings').get();
        const userSettingsMap = new Map<string, any>();
        userSettingsSnapshot.forEach(doc => {
            const data = doc.data();
            userSettingsMap.set(doc.id, {
                aiUsageCount: data.aiUsageCount || 0,
                connections: data.connections || {}, // NEW: Include connections
            });
        });
        
        const allLogsSnapshot = await adminDb.collection('activity_logs').where('action', '==', 'PRODUCT_CREATED').get();
        const historicalProductCounts = new Map<string, number>();
        allLogsSnapshot.forEach(doc => {
            const userId = doc.data().userId;
            if (userId) {
                historicalProductCounts.set(userId, (historicalProductCounts.get(userId) || 0) + 1);
            }
        });

        let usersQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('users');

        if (adminContext.role === 'admin' && adminContext.companyId) {
            usersQuery = usersQuery.where('companyId', '==', adminContext.companyId);
        }
        
        const usersSnapshot = await usersQuery.get();

        const users: User[] = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            const companyId = data.companyId || null;
            const companyInfo = companyId ? companiesMap.get(companyId) : null;
            const userSettings = userSettingsMap.get(doc.id);
            
            const aiUsageCount = companyInfo 
                ? companyInfo.aiUsageCount 
                : (userSettings?.aiUsageCount || 0);

            return {
                uid: doc.id,
                email: data.email || '',
                displayName: data.displayName || 'No Name',
                photoURL: data.photoURL || '',
                role: data.role || 'pending',
                status: data.status || 'pending_approval',
                siteLimit: data.siteLimit ?? 1,
                companyId: companyId,
                companyName: companyInfo?.name || null,
                companyPlan: companyInfo?.plan || null,
                plan: data.plan || null,
                platform: data.platform || null,
                companyPlatform: companyInfo?.platform || null,
                aiUsageCount: aiUsageCount,
                productCount: historicalProductCounts.get(doc.id) || 0,
                connections: companyInfo ? companyInfo.connections : (userSettings?.connections || {}), // NEW
            };
        });

        return NextResponse.json({ users });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching users for admin:", error);
        return NextResponse.json({ error: 'Failed to fetch users', details: errorMessage }, { status: 500 });
    }
}
