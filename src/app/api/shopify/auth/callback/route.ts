
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac, getPartnerAppCredentials } from '@/lib/api-helpers';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const shop = searchParams.get('shop'); // shop domain of the partner's account
    const state = searchParams.get('state'); // This is our entity info "entityType:entityId"

    const settingsUrl = new URL('/settings/connections', req.nextUrl.origin);

    if (!code || !hmac || !shop || !state) {
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', "Petición inválida desde Shopify: faltan parámetros.");
        return NextResponse.redirect(settingsUrl);
    }
    
    try {
        if (!adminDb || !admin.firestore.FieldValue) {
            throw new Error("El servicio de base de datos no está disponible.");
        }
        
        const [entityType, entityId] = state.split(':');

        if (!entityType || !entityId || (entityType !== 'user' && entityType !== 'company')) {
             throw new Error("El parámetro 'state' de la autorización es inválido.");
        }
        
        const { clientId, clientSecret } = await getPartnerAppCredentials(entityId, entityType as 'user' | 'company');

        // 1. Validate HMAC to ensure the request is from Shopify
        if (!validateHmac(searchParams, clientSecret)) {
            return new NextResponse("HMAC validation failed. La petición no es de Shopify.", { status: 403 });
        }
        
        // 2. Exchange authorization code for a permanent access token for the PARTNER API
        const tokenUrl = `https://partners.shopify.com/oauth/access_token`;
        const tokenResponse = await axios.post(tokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            code,
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
             throw new Error("No se recibió un token de acceso de Shopify Partner.");
        }
        
        // 3. Save the permanent access token securely to the user/company settings
        const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
        const settingsRef = adminDb.collection(settingsCollection).doc(entityId);
            
        await settingsRef.set({
            partnerApiToken: accessToken,
        }, { merge: true });

        // 4. Redirect user back to the settings page with a success message
        settingsUrl.searchParams.set('shopify_auth', 'success');
        return NextResponse.redirect(settingsUrl);

    } catch (error: any) {
        console.error(`[Shopify Callback Error] State: ${state}, Error:`, error.response?.data || error.message);
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', error.message || 'Error desconocido durante la autorización.');
        return NextResponse.redirect(settingsUrl);
    }
}
