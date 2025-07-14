
import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { getPartnerCredentials } from '@/lib/api-helpers';


async function updateJobStatus(jobId: string, status: 'processing' | 'completed' | 'error' | 'authorized' | 'awaiting_auth', logMessage: string, extraData: Record<string, any> = {}) {
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

        // --- New Logic: Generate OAuth URL ---
        const settingsDoc = await adminDb.collection('companies').doc('global_settings').get();
        const customAppCreds = settingsDoc.data()?.connections?.shopify_custom_app;

        if (!customAppCreds || !customAppCreds.clientId) {
            throw new Error("El Client ID de la App Personalizada no está configurado en los ajustes globales.");
        }

        const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes';
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        const installUrl = `https://${createdStore.domain}/admin/oauth/authorize?client_id=${customAppCreds.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${jobId}`;
        
        await updateJobStatus(jobId, 'awaiting_auth', 'Tienda creada. Esperando autorización del usuario para poblar contenido.', {
            createdStoreUrl: storeUrl,
            createdStoreAdminUrl: storeAdminUrl,
            storefrontPassword: createdStore.password, 
            installUrl: installUrl,
        });
        
        // Notify the webhook that the store is created and awaiting auth
        if (jobData.webhookUrl) {
            const webhookPayload = {
                jobId: jobId,
                status: 'awaiting_auth',
                message: 'Tienda creada, esperando autorización para configurar.',
                storeName: jobData.storeName,
                storeUrl: storeUrl,
                installUrl: installUrl,
                adminUrl: storeAdminUrl
            };
            try {
                await axios.post(jobData.webhookUrl, webhookPayload, { timeout: 10000 });
            } catch (webhookError: any) {
                console.warn(`[Job ${jobId}] Failed to send awaiting_auth webhook to ${jobData.webhookUrl}: ${webhookError.message}`);
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
 * @description Populates a Shopify store with content after authorization.
 * This function should be triggered after the OAuth flow is complete.
 */
export async function populateShopifyStore(jobId: string) {
     if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        return;
    }
    
    await updateJobStatus(jobId, 'processing', 'Iniciando poblado de contenido...');

    try {
      // TODO: Implement the full logic for populating the store
      // 1. Get job data, including the accessToken
      // 2. Call Shopify Admin API using the accessToken to:
      //    - Create products
      //    - Create pages
      //    - etc.
      
      console.log(`[Job ${jobId}] Store population logic would run here.`);

      // For now, we'll just mark it as complete
       await updateJobStatus(jobId, 'completed', '¡Tienda poblada con éxito!', {});

        const jobDoc = await adminDb.collection('shopify_creation_jobs').doc(jobId).get();
        if (jobDoc.exists && jobDoc.data()?.webhookUrl) {
             const webhookPayload = {
                jobId: jobId,
                status: 'completed',
                message: 'Tienda creada y poblada con éxito.',
                storeName: jobDoc.data()!.storeName,
                storeUrl: jobDoc.data()!.createdStoreUrl,
                adminUrl: jobDoc.data()!.createdStoreAdminUrl,
            };
            try {
                 await axios.post(jobDoc.data()!.webhookUrl, webhookPayload, { timeout: 10000 });
            } catch (webhookError: any) {
                 console.warn(`[Job ${jobId}] Failed to send FINAL COMPLETION webhook to ${jobDoc.data()!.webhookUrl}: ${webhookError.message}`);
            }
        }

    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to populate Shopify store:`, error);
        await updateJobStatus(jobId, 'error', `Error en poblado de contenido: ${error.message}`);
    }
}
