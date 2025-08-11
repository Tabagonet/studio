
import { NextRequest, NextResponse } from 'next/server';
import type * as admin from 'firebase-admin';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { PROMPT_DEFAULTS } from '@/lib/constants';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication required.');

    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    if (!adminDb) throw new Error('Firestore not configured on server.');
    const userDoc = await adminDb.collection('users').doc(uid).get();

    return { uid, role: userDoc.data()?.role || null };
}

const getPromptSchema = z.object({
    promptKey: z.string(),
    connectionKey: z.string(),
    entityType: z.enum(['user', 'company']),
    entityId: z.string(),
});

export async function GET(req: NextRequest) {
    try {
        const { role } = await getUserContext(req);
        if (role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        
        if (!adminDb) throw new Error("Firestore is not configured on server.");

        const { searchParams } = new URL(req.url);
        const validation = getPromptSchema.safeParse(Object.fromEntries(searchParams));

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid query parameters', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { promptKey, connectionKey, entityType, entityId } = validation.data;
        const collectionName = entityType === 'company' ? 'companies' : 'user_settings';
        
        const promptsRef = adminDb.collection(collectionName).doc(entityId).collection('prompts').doc(connectionKey);
        const promptDoc = await promptsRef.get();
        
        const prompt = promptDoc.exists
            ? promptDoc.data()?.prompts?.[promptKey]
            : PROMPT_DEFAULTS[promptKey as keyof typeof PROMPT_DEFAULTS]?.default || '';
        
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
        const { role } = await getUserContext(req);
         if (role !== 'super_admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        if (!adminDb) throw new Error("Firestore is not configured on server.");

        const body = await req.json();

        const promptSchema = z.object({
            prompt: z.string().min(1, 'La plantilla no puede estar vacía'),
            promptKey: z.string().min(1, 'La clave de la plantilla es obligatoria'),
            entityId: z.string(),
            entityType: z.enum(['user', 'company']),
            connectionKey: z.string(),
        });
        
        const validationResult = promptSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Datos inválidos', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { prompt, promptKey, entityId, entityType, connectionKey } = validationResult.data;
        const collectionName = entityType === 'company' ? 'companies' : 'user_settings';

        const promptsRef = adminDb.collection(collectionName).doc(entityId).collection('prompts').doc(connectionKey);

        await promptsRef.set({
            prompts: {
                [promptKey]: prompt
            }
        }, { merge: true });

        return NextResponse.json({ success: true, message: 'Plantilla guardada correctamente.' });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error saving user prompt:', error);
        const status = errorMessage.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: errorMessage || 'Error al guardar la plantilla' }, { status });
    }
}
