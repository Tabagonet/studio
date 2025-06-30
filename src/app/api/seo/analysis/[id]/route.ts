
'use server';
import '@/ai/genkit';

import {NextRequest, NextResponse} from 'next/server';
import {adminAuth, adminDb} from '@/lib/firebase-admin';
import { runFlow } from '@genkit-ai/core';
import { interpretSeoAnalysis } from '@/ai/flows/interpret-seo-analysis';

export async function GET(
  req: NextRequest,
  {params}: {params: {id: string}}
) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth)
      throw new Error(
        'La autenticación del administrador de Firebase no está inicializada.'
      );
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({error: error.message}, {status: 401});
  }

  if (!adminDb) {
    return NextResponse.json(
      {error: 'Firestore no configurado en el servidor'},
      {status: 503}
    );
  }

  const {id} = params;
  if (!id) {
    return NextResponse.json(
      {error: 'El ID del análisis es obligatorio.'},
      {status: 400}
    );
  }

  try {
    const docRef = adminDb.collection('seo_analyses').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({error: 'Análisis no encontrado.'}, {status: 404});
    }

    const data = docSnap.data();

    // Security check: ensure the user is requesting their own analysis.
    if (data?.userId !== uid) {
      return NextResponse.json({error: 'Acceso prohibido.'}, {status: 403});
    }

    const record = {
      id: docSnap.id,
      ...data,
      createdAt: data?.createdAt.toDate().toISOString(),
    };

    return NextResponse.json(record);
  } catch (error: any) {
    console.error(`Error fetching SEO analysis ${id}:`, error);
    return NextResponse.json(
      {
        error: 'Fallo al obtener los detalles del análisis',
        details: error.message,
      },
      {status: 500}
    );
  }
}


export async function POST(
  req: NextRequest,
  {params}: {params: {id: string}}
) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth)
      throw new Error(
        'La autenticación del administrador de Firebase no está inicializada.'
      );
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({error: error.message}, {status: 401});
  }

  if (!adminDb) {
    return NextResponse.json(
      {error: 'Firestore no configurado en el servidor'},
      {status: 503}
    );
  }

  const {id} = params;
  if (!id) {
    return NextResponse.json(
      {error: 'El ID del análisis es obligatorio.'},
      {status: 400}
    );
  }

  try {
    const docRef = adminDb.collection('seo_analyses').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({error: 'Análisis no encontrado.'}, {status: 404});
    }

    const data = docSnap.data();
    if (data?.userId !== uid) {
      return NextResponse.json({error: 'Acceso prohibido.'}, {status: 403});
    }
    
    if (!data.analysis) {
        throw new Error("Los datos del análisis en el registro están corruptos o incompletos.");
    }
    
    const interpretationResult = await interpretSeoAnalysis(data.analysis);

    return NextResponse.json(interpretationResult);

  } catch (error: any) {
    console.error(`Error interpreting analysis ${id}:`, error);
    const errorMessage = error.message;
    if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json(
      {
        error: 'La IA falló: ' + errorMessage,
      },
      {status: 500}
    );
  }
}
