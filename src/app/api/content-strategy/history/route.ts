
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { StrategyPlan } from '@/app/(app)/content-strategy/page';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }

    try {
        const snapshot = await adminDb.collection('content_strategy_plans')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();

        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }
        
        const history: StrategyPlan[] = [];
        snapshot.docs.forEach(doc => {
            try {
                const data = doc.data();
                if (!data) return;

                // Robust date handling
                let createdAtString = new Date().toISOString(); // Default to now if missing
                if (data.createdAt) {
                    if (typeof data.createdAt.toDate === 'function') {
                        // It's a Firestore Timestamp, convert it
                        createdAtString = data.createdAt.toDate().toISOString();
                    } else if (typeof data.createdAt === 'string') {
                        // It's already a string
                        createdAtString = data.createdAt;
                    }
                }
                
                // Construct a valid plan object, providing defaults for missing fields
                const plan: StrategyPlan = {
                    id: doc.id,
                    businessContext: data.businessContext || 'Contexto no disponible',
                    url: data.url || null,
                    createdAt: createdAtString,
                    pillarContent: data.plan?.pillarContent || { title: 'Sin título', description: 'Sin descripción' },
                    keywordClusters: data.plan?.keywordClusters || [],
                };
                history.push(plan);

            } catch (innerError: any) {
                // Log the error for the specific document but don't crash the entire request
                console.error(`Failed to process document ${doc.id} in content strategy history:`, innerError.message);
            }
        });

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error('Error fetching content strategy history:', error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }
    
    const { searchParams } = new URL(req.url);
    const planId = searchParams.get('id');
    if (!planId) {
        return NextResponse.json({ error: 'Plan ID is required.' }, { status: 400 });
    }

    try {
        const planRef = adminDb.collection('content_strategy_plans').doc(planId);
        const doc = await planRef.get();

        if (!doc.exists) {
            return NextResponse.json({ success: true, message: 'Plan already deleted.' });
        }
        if (doc.data()?.userId !== uid) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        
        await planRef.delete();
        return NextResponse.json({ success: true });
        
    } catch (error: any) {
        console.error('Error deleting content strategy plan:', error);
        return NextResponse.json({ error: 'Failed to delete plan', details: error.message }, { status: 500 });
    }
}
