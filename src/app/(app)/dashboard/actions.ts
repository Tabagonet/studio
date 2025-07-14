
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';

// This is a server action, designed to be called from a client component.
// It now creates the job in Firestore and then DIRECTLY calls the task handler endpoint.

export async function triggerShopifyCreationTestAction(): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Triggering Shopify Creation Test...');
    
    if (!adminDb) {
        return { success: false, message: "Error del servidor: Firestore no está configurado." };
    }

    const timestamp = Date.now();
    const storeData = {
        storeName: `Tienda de Prueba ${timestamp}`,
        businessEmail: `test-${timestamp}@example.com`,
        countryCode: "ES",
        currency: "EUR",
        brandDescription: "Una tienda de prueba generada automáticamente para verificar el flujo de creación de AutoPress AI.",
        targetAudience: "Desarrolladores y equipo de producto.",
        brandPersonality: "Funcional, robusta y eficiente.",
        legalBusinessName: "AutoPress Testing SL",
        businessAddress: "Calle Ficticia 123, 08001, Barcelona, España"
    };

    try {
        const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
        if (companyQuery.empty) {
            return { success: false, message: "Error de configuración: La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos." };
        }
        const ownerCompanyId = companyQuery.docs[0].id;

        const jobPayload = {
            webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", // Example webhook for testing
            storeName: storeData.storeName,
            businessEmail: storeData.businessEmail,
            countryCode: storeData.countryCode,
            currency: storeData.currency,
            brandDescription: storeData.brandDescription,
            targetAudience: storeData.targetAudience,
            brandPersonality: storeData.brandPersonality,
            productTypeDescription: 'Productos de ejemplo para tienda nueva',
            creationOptions: {
                createExampleProducts: true,
                numberOfProducts: 3,
                createAboutPage: true,
                createContactPage: true,
                createLegalPages: true,
                createBlogWithPosts: true,
                numberOfBlogPosts: 2,
                setupBasicNav: true,
                theme: "dawn",
            },
            legalInfo: {
                legalBusinessName: storeData.legalBusinessName,
                businessAddress: storeData.businessAddress,
            },
            entity: {
                type: 'company' as 'company' | 'user',
                id: ownerCompanyId,
            }
        };

        const jobRef = adminDb.collection('shopify_creation_jobs').doc();
        
        await jobRef.set({
          ...jobPayload,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          logs: [{ timestamp: new Date(), message: 'Trabajo creado desde el botón de prueba.' }]
        });
    
        const jobId = jobRef.id;

        // Directly call the task handler endpoint instead of enqueuing a task
        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/create-shopify-store`;
        
        // Note: For a production app, you'd secure this call, but since this is an internal
        // test action running on the server, we can call it directly. The endpoint's own
        // security is what matters for external calls.
        console.log(`[Server Action] Directly calling task handler for Job ID: ${jobId} at ${targetUri}`);
        
        // This is a fire-and-forget call. We don't wait for it to finish.
        axios.post(targetUri, { jobId }, {
            // We don't need an OIDC token here because we are not acting as a Cloud Task.
            // The endpoint security will need to be adjusted to allow this server-to-server call.
        }).catch(error => {
            // Log the error but don't fail the user-facing action, as the job is already created.
            console.error(`[Server Action] Error calling task handler for job ${jobId}:`, error.message);
        });

        console.log('[Server Action] Job creation triggered successfully. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        console.error('[Server Action Error] Failed to trigger store creation:', error);
        return { success: false, message: `No se pudo iniciar el trabajo: ${error.message}` };
    }
}
