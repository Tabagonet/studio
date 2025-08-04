

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    if (!adminAuth) throw new Error('Firebase Admin Auth is not initialized.');
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
    return NextResponse.json(
      {error: 'Authentication failed', message: error.message},
      {status: 401}
    );
  }

  try {
    const body = await req.json();

    // Standardized schema: always expect `contentToTranslate`
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

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
    const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
    
    const result = await model.generateContent(`${systemInstruction}\n\n${prompt}`);
    const response = await result.response;
    const output = JSON.parse(response.text());

    if (!output || typeof output !== 'object') {
      throw new Error(
        'AI returned a non-object or empty response for translation.'
      );
    }
    
    // Increment AI usage count
    if (adminDb) {
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }

    // Always return the raw translated object
    return NextResponse.json(output);

  } catch (error: any) {
    console.error('🔥 Error in /api/translate:', error);
    return NextResponse.json({ error: 'La IA falló: ' + error.message }, { status: 500 });
  }
}
