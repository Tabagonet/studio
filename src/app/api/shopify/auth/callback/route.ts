
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac, getPartnerAppCredentials } from '@/lib/api-helpers';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const shop = searchParams.get('shop'); // The partner's shop domain that authorized
    const state = searchParams.get('state'); // This is our entity info "entityType:entityId"

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_BASE_URL is not set in environment variables.");
    }
    const settingsUrl = new URL('/settings/connections', baseUrl);

    if (!code || !hmac || !shop || !state) {
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', "Petición inválida desde Shopify: faltan parámetros.");
        return NextResponse.redirect(settingsUrl);
    }
    
    try {
        if (!adminDb) {
            throw new Error("El servicio de base de datos no está disponible.");
        }
        
        const [entityType, entityId] = state.split(':');

        if (!entityType || !entityId || (entityType !== 'user' && entityType !== 'company')) {
             throw new Error("El parámetro 'state' de la autorización es inválido.");
        }
        
        const { clientSecret } = await getPartnerAppCredentials(entityId, entityType as 'user' | 'company');

        // 1. Validate HMAC to ensure the request is from Shopify
        if (!validateHmac(searchParams, clientSecret)) {
            return new NextResponse("HMAC validation failed. La petición no es de Shopify.", { status: 403 });
        }
        
        // 2. Exchange authorization code for a permanent access token
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const tokenResponse = await axios.post(tokenUrl, {
            client_id: searchParams.get('client_id'), // The client_id is passed back in the request
            client_secret: clientSecret,
            code,
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
             throw new Error("No se recibió un token de acceso de Shopify Partner.");
        }
        
        // As a temporary measure, we will hardcode the org ID. In a future version, we would fetch this.
        const partnerOrgId = process.env.SHOPIFY_PARTNER_ORG_ID;
        if (!partnerOrgId) {
            throw new Error("SHOPIFY_PARTNER_ORG_ID no está configurado en el servidor.");
        }

        const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
        const settingsRef = adminDb.collection(settingsCollection).doc(entityId);
            
        await settingsRef.set({
            partnerApiToken: accessToken,
            partnerOrgId: partnerOrgId,
        }, { merge: true });

        settingsUrl.searchParams.set('shopify_auth', 'success');
        return NextResponse.redirect(settingsUrl);

    } catch (error: any) {
        console.error(`[Shopify Callback Error] State: ${state}, Error:`, error.response?.data || error.message);
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', error.message || 'Error desconocido durante la autorización.');
        return NextResponse.redirect(settingsUrl);
    }
}
