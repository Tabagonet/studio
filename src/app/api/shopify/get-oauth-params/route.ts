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

        // Corrected scopes according to Shopify's official documentation
        const scopes = [
            'read_products', 'write_products',
            'read_themes', 'write_themes',
            'read_online_store_pages', 'write_online_store_pages', // Correct scope for "pages"
            'read_online_store_navigation', 'write_online_store_navigation', // Correct scope for "navigation"
            'read_files', 'write_files',
            'read_blogs', 'write_blogs',
        ].join(',');

        const responsePayload = {
            clientId: partnerCreds.clientId,
            redirectUri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`,
            scopes: scopes,
        };

        console.log('[API get-oauth-params] Returning payload:', responsePayload);

        return NextResponse.json(responsePayload);

    } catch (error: any) {
        console.error('[API get-oauth-params] ERROR:', error.message);
        return NextResponse.json({ error: 'Failed to get OAuth parameters', details: error.message }, { status: 500 });
    }
}
