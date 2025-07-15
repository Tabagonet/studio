// src/app/api/shopify/auth/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';
import { z } from 'zod';

const initiateAuthSchema = z.object({
  jobId: z.string(),
  clientBaseUrl: z.string().url(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    console.log('[API initiate-auth] Received POST request.');
    
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error("No se proporcionó token de autenticación.");
        if (!adminAuth) throw new Error("Firebase Admin Auth no está inicializado.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
        console.log(`[API initiate-auth] User authenticated successfully. UID: ${uid}`);
    } catch(e: any) {
        console.error("[API initiate-auth] Authentication error:", e.message);
        return NextResponse.json({ error: 'Authentication failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = initiateAuthSchema.safeParse(body);
        if (!validation.success) {
            console.error("[API initiate-auth] Invalid request body:", validation.error.flatten());
            return NextResponse.json({ error: 'Invalid request body', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { jobId, clientBaseUrl } = validation.data;
        console.log(`[API initiate-auth] Processing job ID: ${jobId} with client base URL: ${clientBaseUrl}`);
        
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId) {
            throw new Error("El Client ID de la App Personalizada no está configurado en los ajustes globales.");
        }
        console.log(`[API initiate-auth] Partner credentials retrieved. Client ID: ${partnerCreds.clientId}`);

        if (!adminDb) throw new Error("Firestore not configured.");
        const jobDoc = await adminDb.collection('shopify_creation_jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            throw new Error(`Job with ID ${jobId} not found.`);
        }
        const storeDomain = jobDoc.data()?.storeDomain;
        if (!storeDomain) {
            throw new Error(`Store domain not found on job ${jobId}.`);
        }
        console.log(`[API initiate-auth] Found store domain for job ${jobId}: ${storeDomain}`);

        const redirectUri = `${clientBaseUrl}/api/shopify/auth/callback`;
        console.log(`[API initiate-auth] Constructed redirect URI: ${redirectUri}`);
        
        const scopes = 'read_products,write_products,read_themes,write_themes,read_content,write_content,read_online_store_navigation,write_online_store_navigation,read_files,write_files';
        
        const installUrl = new URL(`https://admin.shopify.com/store/${storeDomain.replace('.myshopify.com', '')}/oauth/authorize`);
        installUrl.searchParams.set('client_id', partnerCreds.clientId);
        installUrl.searchParams.set('scope', scopes);
        installUrl.searchParams.set('redirect_uri', redirectUri);
        installUrl.searchParams.set('state', jobId);

        console.log(`[API initiate-auth] Generated final authorization URL: ${installUrl.toString()}`);
        return NextResponse.json({ authorizationUrl: installUrl.toString() });

    } catch (error: any) {
        console.error("[API initiate-auth] Fatal Error:", error);
        return NextResponse.json({ error: 'Failed to initiate authorization', details: error.message }, { status: 500 });
    }
}
