'use server';
import '@/ai/genkit';
import { runFlow } from '@genkit-ai/core';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { generateProductFlow, GenerateProductInputSchema } from '@/ai/flows/generate-product-flow';


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
    const clientInputSchema = GenerateProductInputSchema.omit({ uid: true });
    const validationResult = clientInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const flowInput = { ...validationResult.data, uid };
    
    const generatedContent = await runFlow(generateProductFlow, flowInput);
    
    return NextResponse.json(generatedContent);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ error: 'Error Interno del Servidor', message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}` }, { status: 500 });
  }
}
