
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';
import { CloudTasksClient } from '@google-cloud/tasks';

// This function needs to be defined if it's not available elsewhere, or imported.
async function enqueueShopifyPopulationTask(jobId: string) {
  const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
  const LOCATION_ID = process.env.CLOUD_TASKS_LOCATION || 'europe-west1';
  const QUEUE_ID = 'autopress-jobs';
  const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL;

  if (!PROJECT_ID || !LOCATION_ID || !QUEUE_ID || !serviceAccountEmail) {
    throw new Error('Cloud Tasks environment variables are not fully configured.');
  }
  const tasksClient = new CloudTasksClient();
  const parent = tasksClient.queuePath(PROJECT_ID, LOCATION_ID, QUEUE_ID);
  
  const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: targetUri,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
      oidcToken: { serviceAccountEmail },
    },
    scheduleTime: { seconds: Date.now() / 1000 + 2 },
  };

  const [response] = await tasksClient.createTask({ parent, task });
  console.log(`[Cloud Task] Enqueued population task: ${response.name}`);
  return response;
}


// A simplified HMAC validation function.
// IMPORTANT: This is a basic implementation. For production, use a more robust library
// that handles various edge cases.
function validateHmac(query: URLSearchParams, clientSecret: string): boolean {
    const hmac = query.get('hmac');
    query.delete('hmac');
    const sortedQuery = Array.from(query.entries())
        .map(([key, value]) => `${key}=${value}`)
        .sort()
        .join('&');
    const crypto = require('crypto');
    const calculatedHmac = crypto.createHmac('sha256', clientSecret).update(sortedQuery).digest('hex');
    return hmac === calculatedHmac;
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
        if (!adminDb || !admin.firestore.FieldValue) {
            throw new Error("El servicio de base de datos no está disponible.");
        }
        
        const jobDoc = await adminDb.collection('shopify_creation_jobs').doc(state).get();
        if (!jobDoc.exists) {
            throw new Error(`No se encontró el trabajo de creación con ID: ${state}`);
        }
        const jobData = jobDoc.data()!;

        // The entity ID is used to fetch the correct Partner credentials.
        // The getPartnerCredentials function needs to be adapted to fetch the Client ID/Secret.
        // For now, let's assume getPartnerCredentials can be modified to return these.
        // This is a temporary placeholder logic.
        
        // This is the part that is likely incorrect in the current setup.
        // It needs Client ID and Secret, not a single token.
        // For this temporary fix, we'll assume they are stored somewhere retrievable.
        // A proper implementation would fetch them from the `companies` or `user_settings` collection.
        
        // Let's create a placeholder for the secret. This needs to be correctly implemented.
        const FAKE_SHOPIFY_PARTNER_CLIENT_SECRET = process.env.SHOPIFY_PARTNER_CLIENT_SECRET;
        if (!FAKE_SHOPIFY_PARTNER_CLIENT_SECRET) {
             throw new Error("SHOPIFY_PARTNER_CLIENT_SECRET no está configurado en el servidor.");
        }

        if (!validateHmac(searchParams, FAKE_SHOPIFY_PARTNER_CLIENT_SECRET)) {
            return new NextResponse("Verificación de seguridad HMAC fallida.", { status: 403 });
        }
        
        const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;
        const FAKE_SHOPIFY_PARTNER_CLIENT_ID = process.env.SHOPIFY_PARTNER_CLIENT_ID;
        if (!FAKE_SHOPIFY_PARTNER_CLIENT_ID) {
            throw new Error("SHOPIFY_PARTNER_CLIENT_ID no está configurado en el servidor.");
        }
        
        const response = await axios.post(accessTokenUrl, {
            client_id: FAKE_SHOPIFY_PARTNER_CLIENT_ID,
            client_secret: FAKE_SHOPIFY_PARTNER_CLIENT_SECRET,
            code: code,
        });
        
        const accessToken = response.data.access_token;
        if (!accessToken) {
            throw new Error("No se recibió un token de acceso de Shopify.");
        }

        await adminDb.collection('shopify_creation_jobs').doc(state).update({
            storeAccessToken: accessToken,
            status: 'authorized', 
            'logs': admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: 'Token de acceso de la tienda obtenido y autorizado. Encolando tarea de población de tienda.' }),
            'updatedAt': admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Enqueue the population task
        await enqueueShopifyPopulationTask(state);

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
        if (state && adminDb && admin.firestore.FieldValue) {
            await adminDb.collection('shopify_creation_jobs').doc(state).update({
                status: 'error',
                logs: admin.firestore.FieldValue.arrayUnion({ timestamp: new Date(), message: `Error en callback de autorización: ${error.message}` }),
            });
        }
        return new NextResponse(`Error en la autorización: ${error.message}`, { status: 500 });
    }
}
