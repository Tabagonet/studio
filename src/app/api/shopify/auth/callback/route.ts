// src/app/api/shopify/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { populateShopifyStore } from '@/lib/tasks/create-shopify-store';
import { validateHmac } from '@/lib/api-helpers';
import axios from 'axios';

export const dynamic = 'force-dynamic';

async function getPartnerCredentials(jobId: string): Promise<{ clientId: string; clientSecret: string; }> {
    if (!adminDb) throw new Error("Firestore not available.");
    
    const jobDoc = await adminDb.collection('shopify_creation_jobs').doc(jobId).get();
    if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
    
    const jobData = jobDoc.data()!;
    const entity = jobData.entity;

    let settingsSource;
    if (entity.type === 'company') {
        const companyDoc = await adminDb.collection('companies').doc(entity.id).get();
        if (!companyDoc.exists) throw new Error(`Company ${entity.id} not found.`);
        settingsSource = companyDoc.data();
    } else {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(entity.id).get();
        settingsSource = userSettingsDoc.data();
    }

    const partnerClientId = settingsSource?.connections?.['shopify_partner']?.partnerClientId;
    const partnerClientSecret = settingsSource?.connections?.['shopify_partner']?.partnerClientSecret;
    
    if (!partnerClientId || !partnerClientSecret) {
        throw new Error('Las credenciales de Shopify Partner App (Client ID/Secret) no están configuradas.');
    }
    
    return { clientId: partnerClientId, clientSecret: partnerClientSecret };
}


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

        // 3. Store the access token securely with the job
        await adminDb.collection('shopify_creation_jobs').doc(state).update({
            storeAccessToken: accessToken,
            'logs': admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: 'Token de acceso de la tienda obtenido con éxito.' }),
            'updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // 4. Trigger the next phase of the background task: populating the store
        // In a real production environment, this would add a task to a queue (e.g., Cloud Tasks)
        // For now, we call the handler directly.
        populateShopifyStore(state);

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
