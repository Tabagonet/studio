
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

// Helper function to get user UID and user settings document from request
async function getUserSettings(req: NextRequest): Promise<{ uid: string; settings: admin.firestore.DocumentData | undefined }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication required.');

    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) throw new Error('Firestore not configured on server.');
    const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    
    return { uid, settings: userSettingsDoc.data() };
}

// GET handler to fetch the prompt for the ACTIVE connection
export async function GET(req: NextRequest) {
    try {
        const { settings } = await getUserSettings(req);
        
        const activeKey = settings?.activeConnectionKey;
        const connections = settings?.connections;
        let prompt: string | null = null;
        
        if (activeKey && connections && connections[activeKey]) {
            prompt = connections[activeKey].promptTemplate || null;
        }

        return NextResponse.json({ 
            prompt: prompt,
            activeConnectionKey: activeKey || null,
        });

    } catch (error: any) {
        console.error('Error fetching user prompt:', error);
        const status = error.message.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: error.message || 'Error al obtener la plantilla' }, { status });
    }
}

// POST handler to save the prompt TO the ACTIVE connection
export async function POST(req: NextRequest) {
    try {
        const { uid, settings } = await getUserSettings(req);
        const body = await req.json();

        const promptSchema = z.object({
            prompt: z.string().min(1, 'La plantilla no puede estar vacía'),
        });
        
        const validationResult = promptSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Datos inválidos', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { prompt } = validationResult.data;
        const activeKey = settings?.activeConnectionKey;

        if (!activeKey) {
            return NextResponse.json({ error: 'No active connection set.', message: 'Debes tener una conexión activa para guardar una plantilla específica.' }, { status: 400 });
        }
        
        const userSettingsRef = adminDb!.collection('user_settings').doc(uid);

        // Use dot notation in an update call to set the nested property
        await userSettingsRef.update({
            [`connections.${activeKey}.promptTemplate`]: prompt
        });

        return NextResponse.json({ success: true, message: 'Plantilla guardada correctamente.', activeConnectionKey: activeKey });
    } catch (error: any) {
        console.error('Error saving user prompt:', error);
        const status = error.message.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: error.message || 'Error al guardar la plantilla' }, { status });
    }
}
