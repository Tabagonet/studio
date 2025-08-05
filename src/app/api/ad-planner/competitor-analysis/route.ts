
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

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

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL parameter is required.' }, { status: 400 });
    }

    try {
        if (!adminDb) throw new Error("Firestore not configured on server."); // Added check
        const snapshot = await adminDb.collection('competitor_analyses')
            .where('userId', '==', uid)
            .where('url', '==', url)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ error: 'No analysis found for this URL.' }, { status: 404 });
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        const analysis = {
            id: doc.id,
            ...data,
            createdAt: data.createdAt.toDate().toISOString(),
        };

        return NextResponse.json(analysis);

    } catch (error: any) {
        console.error("Error fetching competitor analysis:", error);
        return NextResponse.json({ error: 'Failed to fetch analysis', details: error.message }, { status: 500 });
    }
}
