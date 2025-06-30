'use server';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { generateProduct, GenerateProductInputSchema } from '@/ai/flows/generate-product-flow';


export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
     return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    // We only validate the fields coming from the client, not the uid we add on the server
    const clientInputSchema = GenerateProductInputSchema.omit({ uid: true });
    const validationResult = clientInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const inputData = validationResult.data;
    
    // Add the server-side UID to the input for the flow
    const flowInput = { ...inputData, uid };
    
    const generatedContent = await generateProduct(flowInput);
    
    return NextResponse.json(generatedContent);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description ---', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ error: 'Error Interno del Servidor', message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}` }, { status: 500 });
  }
}
