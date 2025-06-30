
'use server';
import '@/ai/genkit';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { generateBlogContent, BlogContentInputSchema } from '@/ai/flows/generate-blog-content-flow';

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
        console.log("Handling /api/generate-blog-post request...");
        const body = await req.json();
        const validationResult = BlogContentInputSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const generatedContent = await generateBlogContent(validationResult.data);
        console.log("Blog post content generated successfully.");
        
        return NextResponse.json(generatedContent);

    } catch (error: any) {
        console.error('🔥 Error in /api/generate-blog-post:', error);
        const errorMessage = error.message || 'An unknown error occurred';
        if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
            return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
        }
        return NextResponse.json({ error: 'La IA falló: ' + errorMessage }, { status: 500 });
    }
}
