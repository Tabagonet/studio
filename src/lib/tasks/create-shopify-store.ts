
import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { generateShopifyStoreContent } from '@/ai/flows/shopify-content-flow';
import { createShopifyApi } from '@/lib/shopify';

const SHOPIFY_PARTNER_API_VERSION = '2024-07';
const SHOPIFY_REDIRECT_URI = 'https://autopress.intelvisual.es/api/shopify/auth/callback';

async function updateJobStatus(jobId: string, status: 'processing' | 'completed' | 'error', logMessage: string, extraData: Record<string, any> = {}) {
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

/**
 * Handles the initial creation of a Shopify development store via the Partner API.
 * @param jobId The ID of the job document in Firestore.
 */
export async function handleCreateShopifyStore(jobId: string) {
    if (!adminDb) {
        console.error("Firestore not available in handleCreateShopifyStore.");
        return;
    }

    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        await updateJobStatus(jobId, 'processing', 'Obteniendo credenciales de Shopify Partner...');
        
        let settingsSource;
        if (jobData.entity.type === 'company') {
            const companyDoc = await adminDb.collection('companies').doc(jobData.entity.id).get();
            if (!companyDoc.exists) throw new Error(`Company ${jobData.entity.id} not found.`);
            settingsSource = companyDoc.data();
        } else {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(jobData.entity.id).get();
            settingsSource = userSettingsDoc.data();
        }

        const partnerClientId = settingsSource?.partnerClientId;
        const partnerAccessToken = settingsSource?.partnerAccessToken;

        if (!settingsSource?.partnerClientId || !settingsSource?.partnerAccessToken) {
            throw new Error('Las credenciales de Shopify Partner (Client ID/Secret y Access Token) no están configuradas para esta entidad.');
        }

        const graphqlEndpoint = `https://partners.shopify.com/api/${SHOPIFY_PARTNER_API_VERSION}/graphql.json`;

        await updateJobStatus(jobId, 'processing', `Creando tienda de desarrollo para "${jobData.storeName}"...`);
        
        const mutation = `
            mutation DevelopmentStoreCreate($input: DevelopmentStoreCreateInput!) {
              developmentStoreCreate(input: $input) {
                store {
                  shopId
                  shopName
                  storeUrl
                  adminUrl
                }
                userErrors {
                  field
                  message
                }
              }
            }
        `;
        
        const variables = {
            input: {
                name: jobData.storeName,
                businessEmail: jobData.businessEmail,
                countryCode: jobData.countryCode,
                appId: partnerClientId, // Instruct Shopify to install our app
            }
        };

        const response = await axios.post(
            graphqlEndpoint,
            { query: mutation, variables },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': partnerAccessToken,
                },
            }
        );
        
        const responseData = response.data;
        if (responseData.errors) {
            throw new Error(`Error de GraphQL: ${JSON.stringify(responseData.errors)}`);
        }

        const userErrors = responseData.data?.developmentStoreCreate?.userErrors;
        if (userErrors && userErrors.length > 0) {
            const errorMessages = userErrors.map((e: any) => `${e.field.join('.')}: ${e.message}`).join(', ');
            throw new Error(`Shopify devolvió errores: ${errorMessages}`);
        }

        const createdStore = responseData.data?.developmentStoreCreate?.store;
        if (!createdStore) {
            throw new Error('La API de Shopify no devolvió los datos de la tienda creada.');
        }
        
        await updateJobStatus(jobId, 'processing', `Tienda base creada en: ${createdStore.storeUrl}. Esperando autorización de la app...`, {
            createdStoreUrl: createdStore.storeUrl,
            createdStoreAdminUrl: createdStore.adminUrl,
        });
        
    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to create Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error fatal: ${error.message}`);
    }
}


/**
 * Populates a Shopify store with content after authorization.
 * @param jobId The ID of the job document in Firestore.
 */
export async function populateShopifyStore(jobId: string) {
     if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        return;
    }
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        if (!jobData.storeAccessToken || !jobData.createdStoreUrl) {
            throw new Error("El trabajo no tiene un token de acceso o URL de tienda. No se puede poblar.");
        }

        const entityUid = jobData.entity.type === 'user' ? jobData.entity.id : '';

        // PHASE 3: AI Content Generation
        await updateJobStatus(jobId, 'processing', 'Generando contenido con IA...');
        
        const generatedContent = await generateShopifyStoreContent(jobData, entityUid);
        
        await updateJobStatus(jobId, 'processing', 'Contenido generado. Guardando resultados y preparando para poblar la tienda...', {
            generatedContent: generatedContent,
        });

        // PHASE 4: Populate the store
        const shopifyApi = createShopifyApi({ url: jobData.createdStoreUrl, accessToken: jobData.storeAccessToken });
        if (!shopifyApi) throw new Error("No se pudo inicializar el cliente de la API de Shopify para la nueva tienda.");

        // Here you would add the logic to create pages, products, etc.
        // For now, we'll just log it.
        await updateJobStatus(jobId, 'processing', 'Cliente de API de tienda creado. (Lógica de población pendiente)');
        
        // TODO: Implement page creation
        // TODO: Implement product creation (including image generation and upload)
        // TODO: Implement blog creation
        // TODO: Implement navigation setup

        await updateJobStatus(jobId, 'completed', '¡Proceso finalizado! La tienda ha sido creada y el contenido está listo para ser insertado.');

    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to populate Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error al poblar la tienda: ${error.message}`);
    }
}
