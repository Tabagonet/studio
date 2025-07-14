

import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { generateShopifyStoreContent, type GeneratedContent, type GenerationInput } from '@/ai/flows/shopify-content-flow';
import { createShopifyApi } from '@/lib/shopify';
import type { AxiosInstance } from 'axios';
import { getPartnerCredentials } from '@/lib/api-helpers';


async function updateJobStatus(jobId: string, status: 'processing' | 'completed' | 'error' | 'authorized', logMessage: string, extraData: Record<string, any> = {}) {
    if (!adminDb) return;
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    await jobRef.update({
        status,
        ...extraData,
        logs: admin.firestore.FieldValue.arrayUnion({
            timestamp: new Date(),
            message: logMessage,
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// This function now contains the full logic and is intended to be called by a task handler.
export async function handleCreateShopifyStore(jobId: string) {
    if (!adminDb) {
        console.error("Firestore not available in handleCreateShopifyStore.");
        throw new Error("Firestore not available.");
    }

    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        await updateJobStatus(jobId, 'processing', 'Tarea iniciada. Obteniendo credenciales y ajustes de la entidad...');
        
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        const { partnerApiToken, organizationId } = await getPartnerCredentials(jobData.entity.id, jobData.entity.type);
        if (!partnerApiToken || !organizationId) {
            throw new Error("El token de acceso y el ID de organización de la API de Partner no están configurados.");
        }
        
        await updateJobStatus(jobId, 'processing', `Creando tienda de desarrollo para "${jobData.storeName}"...`);
        
        const graphqlEndpoint = `https://partners.shopify.com/${organizationId}/api/2025-07/graphql.json`;
        
        const graphqlMutation = {
          query: `
            mutation developmentStoreCreate($name: String!) {
              developmentStoreCreate(name: $name) {
                store {
                  shopId
                  domain
                  transferDisabled
                  password
                  shop
                }
                userErrors {
                  field
                  message
                }
              }
            }`,
          variables: {
            name: jobData.storeName,
          },
        };

        const response = await axios.post(
            graphqlEndpoint,
            graphqlMutation,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': partnerApiToken,
                },
            }
        );
        
        const responseData = response.data;
        if (responseData.errors) {
            const errorMessages = typeof responseData.errors === 'object' ? JSON.stringify(responseData.errors) : responseData.errors;
            throw new Error(`Shopify devolvió errores en GraphQL: ${errorMessages}`);
        }
        
        const creationResult = responseData.data.developmentStoreCreate;
        if (creationResult.userErrors && creationResult.userErrors.length > 0) {
            const errorMessages = creationResult.userErrors.map((e: any) => `${e.field}: ${e.message}`).join(', ');
            throw new Error(`Shopify devolvió errores de usuario: ${errorMessages}`);
        }

        const createdStore = creationResult.store;
        if (!createdStore || !createdStore.domain || !createdStore.shopId) {
            throw new Error('La API de Shopify no devolvió los datos de la tienda creada.');
        }

        const storeAdminUrl = `https://${createdStore.domain}/admin`;
        const storeUrl = `https://${createdStore.domain}`;
        
        await updateJobStatus(jobId, 'processing', `Tienda base creada en: ${storeUrl}. La población de contenido no está soportada en este flujo.`, {
            createdStoreUrl: storeUrl,
            createdStoreAdminUrl: storeAdminUrl,
            storefrontPassword: createdStore.password, 
        });
        
        await updateJobStatus(jobId, 'completed', '¡Tienda creada con éxito!');


    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to create Shopify store:`, error.response?.data || error.message);
        await updateJobStatus(jobId, 'error', `Error fatal en la creación: ${error.message}`);
    }
}


export async function populateShopifyStore(jobId: string) {
     if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        return;
    }
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    let createdPages: { title: string; handle: string; }[] = [];

    try {
        await updateJobStatus(jobId, 'processing', 'Tarea de población iniciada.');
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        // This flow is now deprecated as we can't get an Admin API token this way.
        // We will just log a message and complete the job.
        if (!jobData.createdStoreUrl) {
            throw new Error("El trabajo no tiene una URL de tienda creada. No se puede poblar.");
        }
        
        await updateJobStatus(jobId, 'completed', '¡Proceso finalizado! La tienda ha sido creada. La población de contenido debe realizarse manualmente.');

    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to populate Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error al poblar la tienda: ${error.message}`);
    }
}
