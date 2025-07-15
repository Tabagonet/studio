
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { StrategyPlan } from '@/app/(app)/content-strategy/page';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    console.log('[Content Strategy History] GET request received.');
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
        console.log(`[Content Strategy History] User authenticated. UID: ${uid}`);
    } catch (e: any) {
        console.error('[Content Strategy History] Authentication failed:', e.message);
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        console.error('[Content Strategy History] Firestore not configured.');
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }

    try {
        console.log('[Content Strategy History] Querying content_strategy_plans collection for user...');
        // Corrected Query: Remove .orderBy() to avoid needing a composite index.
        // Sorting will be handled in the application code after fetching.
        const snapshot = await adminDb.collection('content_strategy_plans')
            .where('userId', '==', uid)
            .limit(200) // Fetch up to 200 recent plans to sort from.
            .get();
        console.log(`[Content Strategy History] Firestore query returned ${snapshot.size} documents.`);

        if (snapshot.empty) {
            console.log('[Content Strategy History] No plans found. Returning empty history.');
            return NextResponse.json({ history: [] });
        }
        
        const history: StrategyPlan[] = [];
        snapshot.docs.forEach(doc => {
            console.log(`[Content Strategy History] Processing document ID: ${doc.id}`);
            try {
                const data = doc.data();
                if (!data || !data.createdAt || typeof data.createdAt.toDate !== 'function' || !data.businessContext || !data.plan) {
                     console.warn(`[Content Strategy History] Skipping malformed document: ${doc.id}. Data:`, data);
                     return;
                }

                const createdAtString = data.createdAt.toDate().toISOString();
                
                const plan: StrategyPlan = {
                    id: doc.id,
                    businessContext: data.businessContext,
                    url: data.url || null,
                    createdAt: createdAtString,
                    pillarContent: data.plan?.pillarContent || { title: 'Sin título', description: 'Sin descripción' },
                    keywordClusters: data.plan?.keywordClusters || [],
                };
                history.push(plan);
            } catch (innerError: any) {
                console.error(`[Content Strategy History] Failed to process document ${doc.id}:`, innerError.message);
            }
        });

        // Sort the results in memory after fetching
        history.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

        console.log(`[Content Strategy History] Successfully processed and sorted ${history.length} plans. Sending response.`);
        return NextResponse.json({ history });

    } catch (error: any) {
        console.error('[Content Strategy History] Final catch block error:', error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
