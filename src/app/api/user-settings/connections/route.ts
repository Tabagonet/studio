
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

// Helper function to get user UID from token
async function getUserIdFromRequest(req: NextRequest): Promise<string> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken.uid;
}

// GET handler to fetch the user's connections
export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();

        if (userSettingsDoc.exists) {
            const data = userSettingsDoc.data();
            return NextResponse.json({ connections: data?.connections || null });
        }
        return NextResponse.json({ connections: null });
    } catch (error: any) {
        console.error('Error fetching user connections:', error);
        return NextResponse.json({ error: error.message || 'Authentication required' }, { status: 401 });
    }
}

// POST handler to save the user's connections
export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }
    
    try {
        const uid = await getUserIdFromRequest(req);
        const body = await req.json();

        const connectionSchema = z.object({
            wooCommerceStoreUrl: z.string().url().optional().or(z.literal('')),
            wooCommerceApiKey: z.string().optional(),
            wooCommerceApiSecret: z.string().optional(),
            wordpressApiUrl: z.string().url().optional().or(z.literal('')),
            wordpressUsername: z.string().optional(),
            wordpressApplicationPassword: z.string().optional(),
        });
        
        const payloadSchema = z.object({
            connections: connectionSchema
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { connections } = validationResult.data;

        await adminDb.collection('user_settings').doc(uid).set({
            connections: connections
        }, { merge: true });

        return NextResponse.json({ success: true, message: 'Connections saved successfully.' });
    } catch (error: any) {
        console.error('Error saving user connections:', error);
        const status = error.message.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: error.message || 'Failed to save connections' }, { status });
    }
}
