'use server';
import '@/ai/genkit'; // This ensures Genkit is initialized
import { runFlow } from '@genkit-ai/core';
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import {
  translateContentFlow,
  TranslateContentInputSchema,
} from '@/ai/flows/translate-content-flow';

export async function POST(req: NextRequest) {
  // 1. Authenticate the request
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

  // 2. Validate the request body and perform the translation
  try {
    const body = await req.json();

    // The API route receives a different shape, just the content and lang
    const apiSchema = z.object({
        content: z.record(z.string()),
        targetLanguage: z.string(),
    });

    const apiValidation = apiSchema.safeParse(body);
    if (!apiValidation.success) {
         return NextResponse.json(
            {error: 'Invalid API input', details: apiValidation.error.flatten()},
            {status: 400}
        );
    }

    // Construct the input for the flow
    const flowInput = {
        contentToTranslate: apiValidation.data.content,
        targetLanguage: apiValidation.data.targetLanguage
    };
    
    const output = await runFlow(translateContentFlow, flowInput);

    // The flow already handles errors, so we just return the output
    return NextResponse.json(output);
  } catch (error: any) {
    console.error('Error in translation API:', error);
    return NextResponse.json(
      {error: 'Failed to translate content', message: error.message},
      {status: 500}
    );
  }
}
