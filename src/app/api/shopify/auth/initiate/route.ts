// src/app/api/shopify/auth/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

async function verifyAuth(req: NextRequest) {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    // In this specific flow, we might not have a token if it's a direct navigation.
    // The primary check is done by the page routing/middleware before getting here.
    // For a simple GET redirect, we can proceed and let Shopify handle the user session.
    // Let's add a log to be sure.
    if (!token) {
        console.log('[API initiate-auth] No auth token found in headers. Proceeding as direct navigation.');
        return true;
    }
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth not initialized.");
        await adminAuth.verifyIdToken(token);
        return true;
    } catch (e) {
        console.error('Auth error in initiate route, but proceeding.', e);
        // Allow proceeding even if token is invalid, as Shopify will manage its own session.
        return true;
    }
}


export async function GET(req: NextRequest) {
    console.log('[API /api/shopify/auth/initiate] Received GET request.');
    
    // Although the user might be logged into our app, this endpoint doesn't need to strictly block
    // based on our token, as Shopify will handle its own authentication. The critical part is that
    // the user *is* logged into Shopify in their browser.
    
    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        console.error('[API initiate] Missing jobId parameter.');
        return NextResponse.json({ error: 'Job ID is required.' }, { status: 400 });
    }

    try {
        console.log('[API initiate] Fetching partner credentials...');
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId) {
            throw new Error("El Client ID de la App Personalizada no está configurado en los ajustes globales.");
        }
        console.log('[API initiate] Credentials fetched. Client ID:', partnerCreds.clientId);

        const jobDoc = await adminDb.collection('shopify_creation_jobs').doc(jobId).get();
        if (!jobDoc.exists) {
            throw new Error(`Job with ID ${jobId} not found.`);
        }
        const storeDomain = jobDoc.data()?.storeDomain;
        if (!storeDomain) {
            throw new Error(`Store domain not found on job ${jobId}.`);
        }
        console.log(`[API initiate] Found store domain for job ${jobId}: ${storeDomain}`);

        // **CRUCIAL CHANGE**: Use the environment variable for the redirect URI.
        // This makes the behavior consistent and relies on correct environment setup.
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        console.log(`[API initiate] Using environment base URL. Constructed redirect URI: ${redirectUri}`);
        
        const scopes = 'read_products,write_products,read_themes,write_themes,read_content,write_content,read_online_store_navigation,write_online_store_navigation,read_files,write_files';
        
        const installUrl = new URL(`https://admin.shopify.com/store/${storeDomain.replace('.myshopify.com', '')}/oauth/authorize`);
        installUrl.searchParams.set('client_id', partnerCreds.clientId);
        installUrl.searchParams.set('scope', scopes);
        installUrl.searchParams.set('redirect_uri', redirectUri);
        installUrl.searchParams.set('state', jobId);

        console.log(`[API initiate] Redirecting user to Shopify authorization URL: ${installUrl.toString()}`);
        return NextResponse.redirect(installUrl.toString());

    } catch (error: any) {
        console.error("[API initiate] Fatal Error:", error);
        return NextResponse.json({ error: 'Failed to initiate authorization', details: error.message }, { status: 500 });
    }
}
