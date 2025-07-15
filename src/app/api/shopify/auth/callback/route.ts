// src/app/api/shopify/auth/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getServiceAccountCredentials } from '@/lib/firebase-admin';
import { getPartnerCredentials, validateHmac } from '@/lib/api-helpers';
import axios from 'axios';
import { CloudTasksClient } from '@google-cloud/tasks';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const shop = searchParams.get('shop');
    const jobId = searchParams.get('state'); // The job ID was passed in the 'state' parameter

    if (!code || !shop || !jobId) {
        return NextResponse.json({ error: 'Parámetros inválidos recibidos de Shopify.' }, { status: 400 });
    }

    try {
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId || !partnerCreds.clientSecret) {
            throw new Error("El Client ID o Client Secret de la App de Partner no están configurados.");
        }
        
        // 1. Validate the HMAC to ensure the request is from Shopify
        if (!validateHmac(searchParams, partnerCreds.clientSecret)) {
            return NextResponse.json({ error: 'HMAC validation failed. La petición podría no ser de Shopify.' }, { status: 403 });
        }

        // 2. Exchange the authorization code for an access token
        const tokenUrl = `https://${shop}/admin/oauth/access_token`;
        const tokenPayload = {
            client_id: partnerCreds.clientId,
            client_secret: partnerCreds.clientSecret,
            code,
        };

        const tokenResponse = await axios.post(tokenUrl, tokenPayload);
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) {
            throw new Error('No se pudo obtener el token de acceso de Shopify.');
        }

        // 3. Update the job document in Firestore with the token and new status
        if (!adminDb) { throw new Error("Firestore no está disponible."); }
        const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
        
        await jobRef.update({
            storeAccessToken: accessToken,
            status: 'authorized',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            logs: admin.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                message: 'Token de acceso permanente obtenido. Autorización completada.',
            }),
        });

        // 4. Enqueue the next task to populate the store with content
        if (process.env.NODE_ENV === 'development') {
            console.log(`[OAuth Callback] DEV MODE: Calling population task directly for Job ID: ${jobId}`);
            const { populateShopifyStore } = require('@/lib/tasks/populate-shopify-store');
            populateShopifyStore(jobId).catch((e: any) => console.error(`[DEV Direct Call] Error executing task for job ${jobId}:`, e));
        } else {
            const tasksClient = new CloudTasksClient({
                credentials: getServiceAccountCredentials(),
                projectId: process.env.FIREBASE_PROJECT_ID,
            });
            const parent = tasksClient.queuePath(process.env.FIREBASE_PROJECT_ID!, 'europe-west1', 'autopress-jobs');
            const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;
            const task = {
                httpRequest: {
                    httpMethod: 'POST' as const,
                    url: targetUri,
                    headers: { 'Content-Type': 'application/json' },
                    body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
                    oidcToken: { serviceAccountEmail: getServiceAccountCredentials().client_email },
                },
            };
            await tasksClient.createTask({ parent, task });
        }

        // 5. Redirect user to a success page (e.g., the jobs list)
        const redirectUrl = new URL('/shopify/jobs', req.nextUrl.origin);
        redirectUrl.searchParams.set('auth_success', 'true');
        redirectUrl.searchParams.set('jobId', jobId);
        
        return NextResponse.redirect(redirectUrl.toString());

    } catch (error: any) {
        console.error(`[OAuth Callback] Error processing callback for job ${jobId}:`, error.response?.data || error.message);
        // Update the job with an error status if possible
        if (adminDb && jobId) {
            await adminDb.collection('shopify_creation_jobs').doc(jobId).update({
                 status: 'error',
                 logs: admin.firestore.FieldValue.arrayUnion({
                    timestamp: new Date(),
                    message: `Error en el callback de OAuth: ${error.message}`,
                }),
            }).catch(dbError => console.error("Failed to update job with error status:", dbError));
        }
        return NextResponse.json({ error: 'Fallo al procesar el callback de Shopify', details: error.message }, { status: 500 });
    }
}
