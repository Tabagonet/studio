
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

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
        // Query only by user ID to avoid needing a composite index with orderBy.
        const analysesSnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .get();

        // Process in memory to find the latest score for each URL.
        const latestScoresMap: Record<string, { score: number; date: Date }> = {};

        analysesSnapshot.forEach(doc => {
            const data = doc.data();
            // Safety check for data integrity
            if (data.url && data.score !== undefined && data.createdAt?.toDate) {
                const recordDate = data.createdAt.toDate();
                // If we haven't seen this URL, or if the current record is newer, update it.
                if (!latestScoresMap[data.url] || recordDate > latestScoresMap[data.url].date) {
                    latestScoresMap[data.url] = {
                        score: data.score,
                        date: recordDate,
                    };
                }
            }
        });

        // Convert the map to the final format: { url: score }
        const finalScores: Record<string, number> = {};
        for (const url in latestScoresMap) {
            finalScores[url] = latestScoresMap[url].score;
        }

        return NextResponse.json({ scores: finalScores });

    } catch (error: any) {
        console.error('Error fetching latest scores:', error);
        return NextResponse.json({ error: 'Failed to fetch scores', details: error.message }, { status: 500 });
    }
}
