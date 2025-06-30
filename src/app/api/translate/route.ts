'use server';

import {NextRequest, NextResponse} from 'next/server';
import {adminAuth} from '@/lib/firebase-admin';
import {
  translateContent,
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
    // The API route receives the full input object for the flow
    const validation = TranslateContentInputSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {error: 'Invalid input', details: validation.error.flatten()},
        {status: 400}
      );
    }

    // Call the centralized translation flow
    const output = await translateContent(validation.data);

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
