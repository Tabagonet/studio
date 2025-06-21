
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

// Helper function to get user UID from token
async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return null;
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken.uid;
    } catch (error) {
        console.error("Error verifying token in prompt route:", error);
        return null;
    }
}

// GET handler to fetch the user's prompt
export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado en el servidor' }, { status: 503 });
    }

    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 });
    }

    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        if (userSettingsDoc.exists) {
            const data = userSettingsDoc.data();
            // Return prompt if it exists, otherwise return null so client can use default
            return NextResponse.json({ prompt: data?.promptTemplate || null });
        }
        return NextResponse.json({ prompt: null }); // No custom prompt saved yet
    } catch (error: any) {
        console.error('Error fetching user prompt:', error);
        return NextResponse.json({ error: 'Error al obtener la plantilla' }, { status: 500 });
    }
}

// POST handler to save the user's prompt
export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado en el servidor' }, { status: 503 });
    }
    
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Autenticación requerida' }, { status: 401 });
    }
    
    const body = await req.json();
    const promptSchema = z.object({
        prompt: z.string().min(1, 'La plantilla no puede estar vacía'),
    });
    
    const validationResult = promptSchema.safeParse(body);
    if (!validationResult.success) {
        return NextResponse.json({ error: 'Datos inválidos', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const { prompt } = validationResult.data;

    try {
        await adminDb.collection('user_settings').doc(uid).set({
            promptTemplate: prompt
        }, { merge: true }); // Use merge to not overwrite other potential settings

        return NextResponse.json({ success: true, message: 'Plantilla guardada correctamente.' });
    } catch (error: any) {
        console.error('Error saving user prompt:', error);
        return NextResponse.json({ error: 'Error al guardar la plantilla' }, { status: 500 });
    }
}
