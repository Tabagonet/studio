
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
        // This query is more efficient and less likely to fail than fetching all user documents.
        // It may require a composite index, but Firestore will provide a link to create it in the error log if needed.
        const historySnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .where('url', '==', url)
            .get();
        
        let historyForUrl = historySnapshot.docs.map(doc => {
            const data = doc.data();
            if (!data || !data.createdAt || typeof data.createdAt.toDate !== 'function') {
                return null;
            }
            return {
                id: doc.id,
                ...data,
                createdAt: data.createdAt.toDate().toISOString(),
            };
        }).filter(Boolean as any as (value: any) => value is NonNullable<any>>);

        // Sort in memory after fetching
        historyForUrl.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        // Limit results after sorting
        const limitedHistory = historyForUrl.slice(0, 10);

        return NextResponse.json({ history: limitedHistory });

    } catch (error: any) {
        console.error("Error fetching SEO analysis history:", error);
        if ((error as any).code === 'FAILED_PRECONDITION') {
             console.error("Firestore query requires a composite index. Please create it using the link in the Firebase console logs.");
             return NextResponse.json({ error: 'Error de base de datos: Se requiere una configuración de índice. Por favor, contacta al soporte.', details: (error as any).details }, { status: 500 });
        }
        return NextResponse.json({ error: 'Fallo al obtener el historial de análisis', details: error.message }, { status: 500 });
    }
}
