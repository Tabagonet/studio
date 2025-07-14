
import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
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

// This function contains the full logic for creating a development store.
// It's the primary task executed by the Cloud Task queue.
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
        
        // This is the final successful state. The store is created. Content population is not possible.
        await updateJobStatus(jobId, 'completed', '¡Tienda creada con éxito! La población automática de contenido no es posible con este método. Accede al admin para continuar.', {
            createdStoreUrl: storeUrl,
            createdStoreAdminUrl: storeAdminUrl,
            storefrontPassword: createdStore.password, 
        });
        
        // Notify the webhook of success
        if (jobData.webhookUrl) {
            const webhookPayload = {
                jobId: jobId,
                status: 'completed',
                message: '¡Tienda creada con éxito!',
                storeName: jobData.storeName,
                storeUrl: storeUrl,
                adminUrl: storeAdminUrl,
            };
            try {
                await axios.post(jobData.webhookUrl, webhookPayload, { timeout: 10000 });
            } catch (webhookError: any) {
                console.warn(`[Job ${jobId}] Failed to send success webhook to ${jobData.webhookUrl}: ${webhookError.message}`);
                // Don't fail the job if the webhook fails, just log it.
            }
        }


    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to create Shopify store:`, error.response?.data || error.message);
        const errorMessage = error.message;
        await updateJobStatus(jobId, 'error', `Error fatal en la creación: ${errorMessage}`);
        
        const jobDoc = await jobRef.get();
        if (jobDoc.exists && jobDoc.data()?.webhookUrl) {
             const webhookPayload = {
                jobId: jobId,
                status: 'error',
                message: errorMessage,
                storeName: jobDoc.data()!.storeName,
            };
            try {
                 await axios.post(jobDoc.data()!.webhookUrl, webhookPayload, { timeout: 10000 });
            } catch (webhookError: any) {
                 console.warn(`[Job ${jobId}] Failed to send ERROR webhook to ${jobDoc.data()!.webhookUrl}: ${webhookError.message}`);
            }
        }
    }
}


/**
 * @deprecated This function is no longer viable as the Partner API does not provide an Admin API access token
 * for programmatically populating the newly created development store. This function is kept for structural
 * integrity but its execution path is removed.
 */
export async function populateShopifyStore(jobId: string) {
     if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        return;
    }
    console.log(`[Job ${jobId}] populateShopifyStore task was called, but is deprecated. The creation process is now complete after the store is created.`);
    // We don't need to update the status here again, as the main task already sets it to 'completed'.
}
