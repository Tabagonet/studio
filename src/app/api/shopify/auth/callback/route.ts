
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac, getPartnerCredentials as getPartnerAppCredentials } from '@/lib/api-helpers';
import axios from 'axios';
import { CloudTasksClient } from '@google-cloud/tasks';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const shop = searchParams.get('shop'); // shop domain is the entityId in our state
    const state = searchParams.get('state'); // This is our Job ID

    if (!code || !hmac || !shop || !state) {
        return new NextResponse("Petición inválida desde Shopify: faltan parámetros.", { status: 400 });
    }
    
    try {
        if (!adminDb || !admin.firestore.FieldValue) {
            throw new Error("El servicio de base de datos no está disponible.");
        }
        
        // The state contains entityType:entityId, e.g., "company:xyz123"
        const [entityType, entityId] = state.split(':');

        if (!entityType || !entityId || (entityType !== 'user' && entityType !== 'company')) {
             throw new Error("El parámetro 'state' de la autorización es inválido.");
        }
        
        const { clientId, clientSecret } = await getPartnerAppCredentials(entityId, entityType as 'user' | 'company');

        // 1. Validate HMAC to ensure the request is from Shopify
        if (!validateHmac(searchParams, clientSecret)) {
            return new NextResponse("HMAC validation failed. La petición no es de Shopify.", { status: 403 });
        }

        // 2. Exchange authorization code for an access token
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const tokenResponse = await axios.post(tokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            code,
        });

        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
             throw new Error("No se recibió un token de acceso de Shopify.");
        }
        
        // 3. Save the access token securely to the user/company settings
        const settingsRef = entityType === 'company'
            ? adminDb.collection('companies').doc(entityId)
            : adminDb.collection('user_settings').doc(entityId);
            
        await settingsRef.set({
            shopifyPartnerAccessToken: accessToken,
            shopifyPartnerShop: shop, // Store the shop domain it was installed on for future reference
        }, { merge: true });

        // 4. Redirect user back to the settings page with a success message
        const settingsUrl = new URL('/settings/connections', req.nextUrl.origin);
        settingsUrl.searchParams.set('shopify_auth', 'success');
        return NextResponse.redirect(settingsUrl);

    } catch (error: any) {
        console.error(`[Shopify Callback Error] State: ${state}, Error:`, error.response?.data || error.message);
        const settingsUrl = new URL('/settings/connections', req.nextUrl.origin);
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', error.message || 'Error desconocido durante la autorización.');
        return NextResponse.redirect(settingsUrl);
    }
}
