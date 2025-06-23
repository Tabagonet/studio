
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const GenerateBlogPostInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required.'),
  keywords: z.string().optional(),
  language: z.string().optional().default('Spanish')
});

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 });
        }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token);

    } catch (error) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('Google AI API key is not configured on the server.');
        }

        const body = await req.json();
        const validationResult = GenerateBlogPostInputSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        const { topic, keywords, language } = validationResult.data;

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest",
            systemInstruction: `You are a professional blog writer and content creator. Your task is to generate a blog post based on a given topic and keywords in the specified language. The response must be a single, valid JSON object with two keys: 'title' and 'content'. The 'title' should be an engaging, SEO-friendly headline. The 'content' should be a well-structured blog post of around 500 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. Do not include markdown or the word 'json' in your output.`,
            generationConfig: {
                responseMimeType: "application/json",
            },
        });
        
        const finalPrompt = `
            Generate a blog post.
            Topic: "${topic}"
            Keywords to include: "${keywords || 'none'}"
            Language: ${language}
        `;

        const result = await model.generateContent(finalPrompt);
        const responseText = result.response.text();
        const parsedJson = JSON.parse(responseText);

        if (!parsedJson.title || !parsedJson.content) {
             throw new Error("AI returned an invalid JSON structure.");
        }
        
        return NextResponse.json(parsedJson);

    } catch (error: any) {
        console.error('Error generating blog post with AI:', error);
        return NextResponse.json({ error: 'Failed to generate blog post', message: error.message }, { status: 500 });
    }
}
