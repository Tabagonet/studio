
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { generate } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

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

    const { contentToTranslate, targetLanguage } = apiValidation.data;

    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
    const prompt = `Translate the following content to ${targetLanguage}:\\n\\n${JSON.stringify(contentToTranslate)}`;
    const outputSchema = z.record(z.string());

    const { output } = await generate({
      model: googleAI('gemini-1.5-flash-latest'),
      system: systemInstruction,
      prompt: prompt,
      output: {
        format: 'json',
        schema: outputSchema,
      },
    });

    if (!output || typeof output !== 'object') {
      throw new Error(
        'AI returned a non-object or empty response for translation.'
      );
    }
    
    return NextResponse.json(output);
  } catch (error: any) {
    console.error('Error in translation API:', error);
    const errorMessage = error.message || 'Failed to translate content';
    if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'La IA falló: ' + errorMessage }, { status: 500 });
  }
}
