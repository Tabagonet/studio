

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { generateShopifyStoreContent, GenerationInput } from '@/ai/flows/shopify-content-flow';

async function getEntityRef(uid: string): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const cost = 10; // Cost for generating Shopify content

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
}


export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided.');
        if (!adminAuth) throw new Error("Firebase Admin is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }

    try {
        const input: GenerationInput = await req.json();

        const [entityRef, cost] = await getEntityRef(uid);
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });
        
        const content = await generateShopifyStoreContent(input, uid);
        
        return NextResponse.json(content);

    } catch (error: any) {
        console.error('Error generating Shopify store content:', error);
        if (error.message && error.message.includes('503')) {
           return NextResponse.json({ error: 'El servicio de IA está sobrecargado en este momento. Por favor, inténtalo de nuevo más tarde.' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to generate content', details: error.message }, { status: 500 });
    }
}
