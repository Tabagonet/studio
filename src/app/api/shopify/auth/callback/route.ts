import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac } from '@/lib/api-helpers';
import axios from 'axios';
import { CloudTasksClient } from '@google-cloud/tasks';

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
        const entityId = jobData.entity.id;
        const entityType = jobData.entity.type;

        let settingsSource;
        if (entityType === 'company') {
            const companyDoc = await adminDb.collection('companies').doc(entityId).get();
            if (!companyDoc.exists) throw new Error(`Company ${entityId} not found.`);
            settingsSource = companyDoc.data();
        } else {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(entityId).get();
            settingsSource = userSettingsDoc.data();
        }

        const partnerConnection = settingsSource?.connections?.['shopify_partner'];
        const { partnerApiClientId, partnerApiSecret } = partnerConnection || {};
        
        if (!partnerApiClientId || !partnerApiSecret) {
            throw new Error('El Client ID y el Client Secret de Shopify Partner no están configurados para esta entidad.');
        }

        if (!validateHmac(searchParams, partnerApiSecret)) {
            return new NextResponse("Verificación de seguridad HMAC fallida.", { status: 403 });
        }
        
        const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;
        
        const response = await axios.post(accessTokenUrl, {
            client_id: partnerApiClientId,
            client_secret: partnerApiSecret,
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
