
import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { generateShopifyStoreContent } from '@/ai/flows/shopify-content-flow';

const SHOPIFY_PARTNER_API_VERSION = '2024-07';

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
 * Handles the entire lifecycle of creating a Shopify development store.
 * This function is designed to be run in the background (e.g., by a Cloud Function).
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
        let entityUid = ''; // UID of the user who owns the settings
        if (jobData.entity.type === 'company') {
            const companyDoc = await adminDb.collection('companies').doc(jobData.entity.id).get();
            if (!companyDoc.exists) throw new Error(`Company ${jobData.entity.id} not found.`);
            settingsSource = companyDoc.data();
            // Company-level jobs don't have a single user UID, so we can't track AI usage to a user.
            // This is a known limitation for now.
        } else { // type is 'user'
            const userSettingsDoc = await adminDb.collection('user_settings').doc(jobData.entity.id).get();
            settingsSource = userSettingsDoc.data();
            entityUid = jobData.entity.id;
        }

        if (!settingsSource?.shopifyPartnerOrgId || !settingsSource?.shopifyPartnerAccessToken) {
            throw new Error('Las credenciales de Shopify Partner no están configuradas para esta entidad.');
        }

        const { shopifyPartnerOrgId: orgId, shopifyPartnerAccessToken: token } = settingsSource;
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
                password: `P@ssword${Date.now()}!` 
            }
        };

        const response = await axios.post(
            graphqlEndpoint,
            { query: mutation, variables },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': token,
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
        
        await updateJobStatus(jobId, 'processing', `Tienda base creada en: ${createdStore.storeUrl}`, {
            createdStoreUrl: createdStore.storeUrl,
            createdStoreAdminUrl: createdStore.adminUrl,
        });

        // --- PHASE 3: AI Content Generation ---
        await updateJobStatus(jobId, 'processing', 'Generando contenido con IA...');
        
        const generatedContent = await generateShopifyStoreContent(jobData, entityUid);
        
        await updateJobStatus(jobId, 'processing', 'Contenido generado. Guardando resultados...', {
            generatedContent: generatedContent,
        });
        // --- End of Phase 3 ---

        await updateJobStatus(jobId, 'completed', '¡Proceso finalizado! La tienda ha sido creada y el contenido está listo.');
        
    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to create Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error fatal: ${error.message}`);
    }
}
