
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User record not found in database.");
    const userData = userDoc.data();
    return {
        uid: uid,
        role: userData?.role || null,
        companyId: userData?.companyId || null,
    };
}

export async function GET(req: NextRequest) {
    let context;
    try {
        context = await getUserContext(req);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 401 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        let query: FirebaseFirestore.Query;
        const jobsCollection = adminDb.collection('shopify_creation_jobs');

        if (context.role === 'super_admin') {
            query = jobsCollection.orderBy('createdAt', 'desc').limit(50);
        } else if (context.companyId) {
            query = jobsCollection.where('entity.type', '==', 'company').where('entity.id', '==', context.companyId).orderBy('createdAt', 'desc').limit(50);
        } else {
            query = jobsCollection.where('entity.type', '==', 'user').where('entity.id', '==', context.uid).orderBy('createdAt', 'desc').limit(50);
        }
        
        const snapshot = await query.get();
        if (snapshot.empty) {
            return NextResponse.json({ jobs: [] });
        }

        const jobs: ShopifyCreationJob[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                status: data.status || 'pending',
                createdAt: data.createdAt.toDate().toISOString(),
                updatedAt: data.updatedAt.toDate().toISOString(),
                storeName: data.storeName || 'N/A',
                businessEmail: data.businessEmail || 'N/A',
                createdStoreUrl: data.createdStoreUrl || null,
                createdStoreAdminUrl: data.createdStoreAdminUrl || null,
                installUrl: data.installUrl || null,
                storefrontPassword: data.storefrontPassword || null,
                webhookUrl: data.webhookUrl,
                countryCode: data.countryCode,
                currency: data.currency,
                brandDescription: data.brandDescription,
                targetAudience: data.targetAudience,
                brandPersonality: data.brandPersonality,
                productTypeDescription: data.productTypeDescription,
                creationOptions: data.creationOptions,
                legalInfo: data.legalInfo,
                entity: data.entity,
            } as ShopifyCreationJob;
        });

        return NextResponse.json({ jobs });

    } catch (error: any) {
        console.error("Error fetching Shopify creation jobs:", error);
        return NextResponse.json({ error: 'Failed to fetch jobs', details: error.message }, { status: 500 });
    }
}
