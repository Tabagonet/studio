
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Prospect } from '@/lib/types';

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
        // This is a placeholder. We will fetch from a 'prospects' collection in the future.
        // For now, return an empty array to allow UI development.
        let prospects: Prospect[] = [];

        // Example future implementation:
        /*
        let query = adminDb.collection('prospects');
        if (adminContext.role === 'admin' && adminContext.companyId) {
            // If we decide prospects belong to companies/agencies
            // query = query.where('assignedCompanyId', '==', adminContext.companyId);
        }
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        prospects = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                email: data.email,
                companyUrl: data.companyUrl,
                status: data.status,
                createdAt: data.createdAt.toDate().toISOString(),
                source: data.source,
                notes: data.notes || '',
            }
        })
        */

        return NextResponse.json({ prospects });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching prospects:", error);
        return NextResponse.json({ error: 'Failed to fetch prospects', details: errorMessage }, { status: 500 });
    }
}
