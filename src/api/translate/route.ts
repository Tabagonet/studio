
'use server';
import '@/ai/genkit';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import {
  translateContent,
} from '@/ai/flows/translate-content-flow';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    if (!adminAuth) throw new Error('Firebase Admin Auth is not initialized.');
    await adminAuth.verifyIdToken(token);
  } catch (error: any) {
    return NextResponse.json(
      {error: 'Authentication failed', message: error.message},
      {status: 401}
    );
  }

  try {
    console.log("Handling /api/translate request...");
    const body = await req.json();

    const apiSchema = z.object({
        contentToTranslate: z.record(z.string()),
        targetLanguage: z.string(),
    });

    const apiValidation = apiSchema.safeParse(body);
    if (!apiValidation.success) {
         return NextResponse.json(
            {error: 'Invalid API input', details: apiValidation.error.flatten()},
            {status: 400}
        );
    }

    const output = await translateContent(apiValidation.data);
    console.log("Translation completed successfully.");

    return NextResponse.json(output);

  } catch (error: any) {
    console.error('🔥 Error in /api/translate:', error);
    const errorMessage = error.message || 'Failed to translate content';
    if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'La IA falló: ' + errorMessage }, { status: 500 });
  }
}
