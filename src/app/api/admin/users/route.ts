
// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Company } from '@/lib/types';

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
                createdAt: data.createdAt?.toDate()?.toISOString() || new Date().toISOString()
            });
        });
        
        let usersQuery: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = adminDb.collection('users');

        if (adminContext.role === 'admin') {
            if (!adminContext.companyId) {
                return NextResponse.json({ users: [] });
            }
            usersQuery = usersQuery.where('companyId', '==', adminContext.companyId);
        }
        
        const usersSnapshot = await usersQuery.get();

        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            const createdAt = data.createdAt ? data.createdAt.toDate().toISOString() : new Date(0).toISOString();
            const companyId = data.companyId || null;
            const companyInfo = companyId ? companiesMap.get(companyId) : null;

            return {
                uid: doc.id,
                email: data.email || '',
                displayName: data.displayName || 'No Name',
                photoURL: data.photoURL || '',
                role: data.role || 'pending',
                status: data.status || 'pending_approval',
                siteLimit: data.siteLimit ?? 1,
                createdAt: createdAt,
                companyId: companyId,
                companyName: companyInfo ? companyInfo.name : null,
                companyPlan: companyInfo ? companyInfo.plan : null,
                plan: data.plan || null, // Individual user plan
                platform: companyInfo ? companyInfo.platform : (data.platform || null),
            };
        });

        return NextResponse.json({ users });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching users for admin:", error);
        return NextResponse.json({ error: 'Failed to fetch users', details: errorMessage }, { status: 500 });
    }
}
