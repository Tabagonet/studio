
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
        
        const history = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                businessContext: data.businessContext,
                url: data.url,
                createdAt: data.createdAt.toDate().toISOString(),
                ...data.plan,
            };
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
