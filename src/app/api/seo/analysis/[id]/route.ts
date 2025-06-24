
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
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

    const { id } = params;
    if (!id) {
        return NextResponse.json({ error: 'El ID del análisis es obligatorio.' }, { status: 400 });
    }

    try {
        const docRef = adminDb.collection('seo_analyses').doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ error: 'Análisis no encontrado.' }, { status: 404 });
        }

        const data = docSnap.data();

        // Security check: ensure the user is requesting their own analysis.
        if (data?.userId !== uid) {
            return NextResponse.json({ error: 'Acceso prohibido.' }, { status: 403 });
        }
        
        const record = {
            id: docSnap.id,
            ...data,
            createdAt: data?.createdAt.toDate().toISOString(),
        };

        return NextResponse.json(record);

    } catch (error: any) {
        console.error(`Error fetching SEO analysis ${id}:`, error);
        return NextResponse.json({ error: 'Fallo al obtener los detalles del análisis', details: error.message }, { status: 500 });
    }
}
