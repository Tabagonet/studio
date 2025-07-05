
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
        // 1. Simplified query to avoid composite index issues. Fetch all first.
        const snapshot = await adminDb.collection('ad_plans')
            .where('userId', '==', uid)
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history = snapshot.docs.map(doc => {
            try { // 2. Add a try/catch block for each document to isolate errors.
                const data = doc.data();

                if (!data || !data.planData || !data.url) {
                    console.warn(`Skipping malformed ad plan history record: ${doc.id}`);
                    return null;
                }
                
                const createdAt = (data.createdAt && typeof data.createdAt.toDate === 'function')
                    ? data.createdAt.toDate() // Get the Date object first
                    : new Date(0); 

                return {
                    id: doc.id,
                    url: data.url,
                    objectives: data.objectives || [],
                    createdAtDate: createdAt, // Temporary property for sorting
                    planData: data.planData as CreateAdPlanOutput,
                };
            } catch (e) {
                console.error(`Error processing history doc ${doc.id}:`, e);
                return null; // Skip corrupted document
            }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null) // Type guard to remove nulls
        .sort((a, b) => b.createdAtDate.getTime() - a.createdAtDate.getTime()) // 3. Sort in memory
        .slice(0, 50) // 4. Limit results after sorting
        .map(({ createdAtDate, ...rest }) => ({ // 5. Format the final output, removing the temp date object
            ...rest,
            createdAt: createdAtDate.toISOString(),
        }));

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
