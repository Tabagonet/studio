
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';
import { getPartnerCredentials } from '@/lib/api-helpers';


const shopifyCallbackSchema = z.object({
    code: z.string(),
    shop: z.string(),
    state: z.string(), // This will be our jobId
});

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const LOCATION_ID = 'europe-west1'; 
const QUEUE_ID = 'autopress-jobs';


// This endpoint is called by Shopify after the user authorizes the app installation.
export async function GET(req: NextRequest) {
    if (!adminDb) {
        return new Response("Error: El servicio de base de datos no está disponible.", { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const validation = shopifyCallbackSchema.safeParse(Object.fromEntries(searchParams));

    if (!validation.success) {
        console.error("Shopify callback - Parámetros inválidos:", validation.error.flatten());
        return new Response(`Error en la autorización: Faltan parámetros o son inválidos.`, { status: 400 });
    }
    
    const { code, shop, state: jobId } = validation.data;
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) {
            throw new Error(`El trabajo con ID ${jobId} no existe.`);
        }
        
        // Use the global helper to get all partner credentials
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId || !partnerCreds.clientSecret) {
             throw new Error("Las credenciales de la App Personalizada de Shopify (Client ID/Secret) no están configuradas en los ajustes globales.");
        }
        
        const { clientId, clientSecret } = partnerCreds;

        // Exchange the authorization code for a permanent access token
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const tokenPayload = {
            client_id: clientId,
            client_secret: clientSecret,
            code,
        };
        
        const tokenResponse = await axios.post(tokenUrl, tokenPayload);
        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new Error('Shopify no devolvió un token de acceso.');
        }
        
        // Save the access token and update the job status
        await jobRef.update({
            status: 'authorized',
            storeAccessToken: accessToken, // Securely store the token
            logs: adminDb.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                message: `Autorización recibida. Token de acceso para ${shop} almacenado.`,
            }),
            updatedAt: adminDb.firestore.FieldValue.serverTimestamp(),
        });
        
        // Enqueue the populate store task
        const parent = tasksClient.queuePath(PROJECT_ID, LOCATION_ID, QUEUE_ID);
        const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL!;
        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;
        const task = {
            httpRequest: {
                httpMethod: 'POST' as const,
                url: targetUri,
                body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
                oidcToken: { serviceAccountEmail },
            },
        };
        await tasksClient.createTask({ parent, task });


        // Return a simple HTML page that closes the popup window.
        const htmlResponse = `
            <!DOCTYPE html>
            <html>
                <head>
                    <title>Autorización Completa</title>
                    <script>
                        // Notify the parent window if available and then close
                        if (window.opener) {
                            window.opener.postMessage('shopifyAuthSuccess', '*');
                        }
                        window.close();
                    </script>
                </head>
                <body>
                    <p>¡Gracias! La autorización se ha completado. Puedes cerrar esta ventana.</p>
                </body>
            </html>
        `;
        return new Response(htmlResponse, { headers: { 'Content-Type': 'text/html' } });

    } catch (error: any) {
        console.error(`[Shopify Callback Error] Job ID ${jobId}:`, error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || error.message || "Un error desconocido ocurrió durante el intercambio de token.";
        
        await jobRef.update({
             status: 'error',
             logs: adminDb.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                message: `Error en el callback de autorización: ${errorMessage}`,
            }),
            updatedAt: adminDb.firestore.FieldValue.serverTimestamp(),
        }).catch(err => console.error(`Failed to update job ${jobId} with error status:`, err));

        const errorHtml = `
            <!DOCTYPE html>
            <html>
                <head><title>Error de Autorización</title></head>
                <body><p>Hubo un error: ${errorMessage}. Por favor, intenta autorizar de nuevo o contacta con el soporte.</p></body>
            </html>
        `;
        return new Response(errorHtml, { headers: { 'Content-Type': 'text/html' }, status: 500 });
    }
}
