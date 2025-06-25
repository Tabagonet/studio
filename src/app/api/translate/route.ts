
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { translateContent } from '@/lib/api-helpers';
import { z } from 'zod';

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
        const { content, targetLanguage } = validation.data;
        const translated = await translateContent(content, targetLanguage);
        return NextResponse.json({ content: translated });
    } catch (error: any) {
        console.error('Error in translation API:', error);
        return NextResponse.json({ error: 'Failed to translate content', message: error.message }, { status: 500 });
    }
}
