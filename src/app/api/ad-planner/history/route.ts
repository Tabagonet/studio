
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { CreateAdPlanOutput } from '@/app/(app)/ad-planner/schema';

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
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history = snapshot.docs.map(doc => {
            try {
                const data = doc.data();

                if (!data || !data.url || !data.objectives || !data.createdAt) {
                     console.warn(`Skipping malformed ad plan history record: ${doc.id}`);
                    return null;
                }
                
                // Exclude server-only fields before sending to client
                const { userId, createdAt, ...planData } = data;

                return {
                    id: doc.id,
                    url: data.url,
                    objectives: data.objectives,
                    createdAt: data.createdAt.toDate().toISOString(),
                    // Reconstruct the full plan object for the client, including the ID
                    planData: { id: doc.id, ...planData } as CreateAdPlanOutput,
                };
            } catch (e) {
                 console.error(`Error processing history doc ${doc.id}:`, e);
                 return null;
            }
        }).filter(Boolean); // Remove nulls from failed records

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
