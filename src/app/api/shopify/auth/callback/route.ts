// src/app/api/shopify/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac, getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state'); // This is our Job ID

    if (!code || !hmac || !shop || !state) {
        return new NextResponse("Petición inválida desde Shopify.", { status: 400 });
    }
    
    try {
        const { clientId, clientSecret } = await getPartnerCredentials(state);

        // 1. Validate HMAC to ensure the request is genuinely from Shopify
        if (!validateHmac(searchParams, clientSecret)) {
            return new NextResponse("Verificación de seguridad HMAC fallida.", { status: 403 });
        }
        
        // 2. Exchange the authorization code for a permanent access token
        const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;
        const response = await axios.post(accessTokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            code: code,
        });
        
        const accessToken = response.data.access_token;
        if (!accessToken) {
            throw new Error("No se recibió un token de acceso de Shopify.");
        }

        if (!adminDb || !admin.firestore.FieldValue) {
            throw new Error("El servicio de base de datos no está disponible.");
        }

        // 3. Store the access token and set status to 'authorized' to trigger the next step
        await adminDb.collection('shopify_creation_jobs').doc(state).update({
            storeAccessToken: accessToken,
            status: 'authorized', // NEW: Set status to trigger background processing
            'logs': admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: 'Token de acceso de la tienda obtenido y autorizado con éxito. El proceso de población comenzará en breve.' }),
            'updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // NOTE: We are no longer directly calling populateShopifyStore here.
        // A separate background process/task queue would pick up jobs with status 'authorized'.

        // 5. Respond to the user with a success page
        return new NextResponse(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>¡Conexión Exitosa!</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f4f6f8; margin: 0; }
                    .container { text-align: center; background: white; padding: 40px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                    h1 { color: #202223; }
                    p { color: #6d7175; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>✅ ¡Autorización completada!</h1>
                    <p>Hemos conectado de forma segura con tu nueva tienda Shopify. El resto del proceso de creación continuará en segundo plano.</p>
                    <p><strong>Puedes cerrar esta ventana.</strong></p>
                </div>
            </body>
            </html>
        `, {
            headers: { 'Content-Type': 'text/html' },
        });

    } catch (error: any) {
        console.error(`[Shopify Callback Error] Job ID ${state}:`, error.response?.data || error.message);
        // Update the job log with the error
        if (state && adminDb && admin.firestore.FieldValue) {
            await adminDb.collection('shopify_creation_jobs').doc(state).update({
                status: 'error',
                logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Error en callback de autorización: ${error.message}` }),
            });
        }
        return new NextResponse(`Error en la autorización: ${error.message}`, { status: 500 });
    }
}
