
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const analysesSnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .get();

        const latestScores: Record<string, number> = {};

        analysesSnapshot.forEach(doc => {
            const data = doc.data();
            // Since docs are ordered by date descending, the first time we see a URL,
            // it's the most recent analysis for that URL.
            if (data.url && !latestScores[data.url]) {
                latestScores[data.url] = data.score;
            }
        });

        return NextResponse.json({ scores: latestScores });

    } catch (error: any) {
        console.error('Error fetching latest scores:', error);
        return NextResponse.json({ error: 'Failed to fetch scores', details: error.message }, { status: 500 });
    }
}
