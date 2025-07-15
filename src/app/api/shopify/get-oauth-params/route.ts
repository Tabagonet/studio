// src/app/api/shopify/get-oauth-params/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
             throw new Error('No se proporcionó token de autenticación.');
        }
        
        if (!adminAuth) throw new Error("Firebase Admin Auth no está inicializado.");
        await adminAuth.verifyIdToken(token); // Verify the user is logged in
        
        console.log('[API get-oauth-params] User authenticated successfully.');

        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId) {
            throw new Error("El Client ID de la App Personalizada no está configurado en los ajustes globales.");
        }

        console.log('[API get-oauth-params] Partner credentials retrieved.');

        // Use the request's URL to build a dynamic redirect URI
        const requestUrl = new URL(req.url);
        const redirectUri = `${requestUrl.origin}/api/shopify/auth/callback`;

        const scopes = [
            'read_products', 'write_products',
            'read_themes', 'write_themes',
            'read_content', 'write_content',
            'read_online_store_navigation', 'write_online_store_navigation',
            'read_files', 'write_files',
        ].join(',');

        const responsePayload = {
            clientId: partnerCreds.clientId,
            redirectUri: redirectUri,
            scopes: scopes,
        };

        console.log('[API get-oauth-params] Returning payload:', responsePayload);

        return NextResponse.json(responsePayload);

    } catch (error: any) {
        console.error('[API get-oauth-params] ERROR:', error.message);
        return NextResponse.json({ error: 'Failed to get OAuth parameters', details: error.message }, { status: 500 });
    }
}
