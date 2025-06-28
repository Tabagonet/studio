
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { ai } from '@/ai/genkit';

const translateSchema = z.object({
  content: z.record(z.string()),
  targetLanguage: z.string(),
});

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token);
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = translateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { content: contentToTranslate, targetLanguage } = validation.data;
        
        // AI translation logic is now directly in the endpoint
        const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
        const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
        
        const { output } = await ai.generate({
            model: 'googleai/gemini-1.5-flash-latest',
            system: systemInstruction,
            prompt: prompt,
            output: {
                schema: z.record(z.string())
            }
        });

        if (!output || typeof output !== 'object') {
            throw new Error('AI returned a non-object or empty response for translation.');
        }

        return NextResponse.json({ content: output });

    } catch (error: any) {
        console.error('Error in translation API:', error);
        return NextResponse.json({ error: 'Failed to translate content', message: error.message }, { status: 500 });
    }
}
