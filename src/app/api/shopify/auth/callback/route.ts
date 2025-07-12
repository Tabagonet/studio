
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { validateHmac, getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';
import { CloudTasksClient } from '@google-cloud/tasks';

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const LOCATION_ID = 'europe-west1'; // IMPORTANTE: Asegúrate de que esta es la región donde creaste la cola
const QUEUE_ID = 'autopress-jobs';

async function enqueueShopifyPopulationTask(jobId: string) {
  if (!PROJECT_ID) {
    throw new Error('FIREBASE_PROJECT_ID no está configurado en las variables de entorno.');
  }

  const parent = tasksClient.queuePath(PROJECT_ID, LOCATION_ID, QUEUE_ID);
  const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL;
  
  if (!serviceAccountEmail) {
    throw new Error('FIREBASE_CLIENT_EMAIL no está configurado. Es necesario para autenticar las tareas.');
  }
  
  const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url: targetUri,
      headers: {
        'Content-Type': 'application/json',
      },
      body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
       oidcToken: {
          serviceAccountEmail: serviceAccountEmail,
       },
    },
    scheduleTime: {
      seconds: Date.now() / 1000 + 2, // Schedule a few seconds in the future
    },
  };

  const request = { parent: parent, task: task };
  const [response] = await tasksClient.createTask(request);
  console.log(`[Cloud Task] Creada la tarea de población: ${response.name}`);
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

        // The entity ID is used to fetch the correct Partner credentials
        const { clientId, clientSecret } = await getPartnerCredentials(jobData.entity.id);

        if (!validateHmac(searchParams, clientSecret)) {
            return new NextResponse("Verificación de seguridad HMAC fallida.", { status: 403 });
        }
        
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
