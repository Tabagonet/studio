
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { CreateAdPlanOutputSchema, type CreateAdPlanOutput } from '@/app/(app)/ad-planner/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided.');
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }

    try {
        const snapshot = await adminDb.collection('ad_plans')
            .where('userId', '==', uid)
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const historyPromises = snapshot.docs.map(async (doc) => {
            const data = doc.data();
            
            // Handle old nested structure and new flat structure
            const planDataToParse = data.planData || data;

            // Add id and createdAt to the object before parsing
            const fullDataToParse = {
                ...planDataToParse,
                id: doc.id,
                createdAt: data.createdAt?.toDate()?.toISOString() || new Date(0).toISOString(),
            };
            
            const result = CreateAdPlanOutputSchema.safeParse(fullDataToParse);

            if (!result.success) {
                console.warn(`Skipping malformed ad plan history record ${doc.id}:`, result.error.flatten());
                return null;
            }

            return result.data as CreateAdPlanOutput;
        });
        
        const history = (await Promise.all(historyPromises)).filter(Boolean as any as (value: any) => value is NonNullable<any>);

        history.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
