
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
        const historySnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .where('url', '==', url)
            .orderBy('createdAt', 'desc')
            .limit(10)
            .get();
        
        const history = historySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate().toISOString(),
            };
        });

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching SEO analysis history:", error);
        return NextResponse.json({ error: 'Fallo al obtener el historial de análisis', details: error.message }, { status: 500 });
    }
}

    