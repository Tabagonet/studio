
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';

// This is a server action, designed to be called from a client component.
// It now creates the job by calling the public API endpoint, mimicking an external request.
// This ensures the entire task queuing flow is properly tested.

export async function triggerShopifyCreationTestAction(): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Triggering Shopify Creation Test via public API endpoint...');
    
    if (!adminDb) {
        return { success: false, message: "Error del servidor: Firestore no está configurado." };
    }
    
    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        return { success: false, message: "Error de configuración: La clave SHOPIFY_AUTOMATION_API_KEY no está configurada en el servidor." };
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

        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`;
        
        console.log(`[Server Action] Calling API endpoint: ${targetUri}`);
        
        const response = await axios.post(targetUri, jobPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`,
            }
        });

        if (response.status !== 202) {
             throw new Error(`La API devolvió un estado inesperado: ${response.status}`);
        }

        const jobId = response.data.jobId;
        console.log('[Server Action] Job creation successfully enqueued by the API. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        console.error('[Server Action Error] Failed to trigger store creation:', error.response?.data || error.message);
        const details = error.response?.data?.details?.message || error.message;
        return { success: false, message: `No se pudo iniciar el trabajo: ${details}` };
    }
}
