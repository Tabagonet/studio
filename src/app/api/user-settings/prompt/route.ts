
import { NextRequest, NextResponse } from 'next/server';
import type * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

async function getUserContext(req: NextRequest): Promise<{ uid: string; settings: admin.firestore.DocumentData | undefined; settingsRef: admin.firestore.DocumentReference }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication required.');

    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) throw new Error('Firestore not configured on server.');
    
    // For prompts, we always edit the SUPER ADMIN's personal settings, as they are the only ones with access.
    const settingsRef = adminDb.collection('user_settings').doc(uid);
    const settingsDoc = await settingsRef.get();
    
    return { uid, settings: settingsDoc.data(), settingsRef };
}


export async function GET(req: NextRequest) {
    try {
        const { settings } = await getUserContext(req);
        const { searchParams } = new URL(req.url);
        const promptKey = searchParams.get('key');

        if (!promptKey) {
            return NextResponse.json({ error: 'Prompt key is required.' }, { status: 400 });
        }

        const prompt = settings?.prompts?.[promptKey] || null;
        
        return NextResponse.json({ prompt });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error fetching user prompt:', error);
        const status = errorMessage.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: errorMessage || 'Error al obtener la plantilla' }, { status });
    }
}


export async function POST(req: NextRequest) {
    try {
        const { settingsRef } = await getUserContext(req);
        const body = await req.json();

        const promptSchema = z.object({
            prompt: z.string().min(1, 'La plantilla no puede estar vacía'),
            promptKey: z.string().min(1, 'La clave de la plantilla es obligatoria'),
        });
        
        const validationResult = promptSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Datos inválidos', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { prompt, promptKey } = validationResult.data;
        
        // Use dot notation to update a specific prompt within the prompts map
        await settingsRef.set({
            prompts: {
                [promptKey]: prompt
            }
        }, { merge: true });

        return NextResponse.json({ success: true, message: 'Plantilla guardada correctamente.', promptKey: promptKey });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error saving user prompt:', error);
        const status = errorMessage.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: errorMessage || 'Error al guardar la plantilla' }, { status });
    }
}
