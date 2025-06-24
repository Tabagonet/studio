
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No se proporcionó token de autenticación.');
        if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado en el servidor' }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'El parámetro URL es obligatorio.' }, { status: 400 });
    }

    try {
        // Query only by user to avoid needing a composite index.
        // We will sort and filter in memory on the server.
        const historySnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .get();
        
        let allUserHistory = historySnapshot.docs.map(doc => {
            const data = doc.data();
            // Safety check for malformed data to prevent crashes
            if (!data || !data.createdAt || typeof data.createdAt.toDate !== 'function') {
                return null;
            }
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate().toISOString(),
            };
        }).filter(Boolean as any as (value: any) => value is NonNullable<any>); // Remove nulls and type guard

        // Sort in code to ensure descending order by date
        allUserHistory.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Filter for the specific URL and limit the results
        const historyForUrl = allUserHistory.filter(record => record.url === url).slice(0, 10);

        return NextResponse.json({ history: historyForUrl });

    } catch (error: any) {
        console.error("Error fetching SEO analysis history:", error);
        if ((error as any).code) {
             console.error(`Firestore error code: ${(error as any).code}`);
        }
        return NextResponse.json({ error: 'Fallo al obtener el historial de análisis', details: error.message }, { status: 500 });
    }
}
