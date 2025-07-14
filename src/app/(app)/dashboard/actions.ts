
'use server';

import axios from 'axios';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// This is a server action, designed to be called from a client component.
// It now directly calls the public-facing API endpoint with the secret key.
export async function triggerShopifyCreationTestAction(token: string): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Initiating Shopify creation test...');
    
    // Auth Check: Ensure the user calling this action is authenticated.
    try {
      if (!adminAuth) throw new Error("Firebase Admin not initialized.");
      await adminAuth.verifyIdToken(token);
    } catch (error) {
      console.error('[Server Action Auth Error]', error);
      return { success: false, message: 'Authentication failed.' };
    }

    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        console.error('SERVER ERROR: SHOPIFY_AUTOMATION_API_KEY is not set.');
        return { success: false, message: 'Servicio de automatización no configurado en el servidor.' };
    }

    if (!process.env.NEXT_PUBLIC_BASE_URL) {
        return { success: false, message: 'Error de configuración: La URL base de la aplicación no está definida en el servidor.' };
    }
    
    // Construct the payload for the creation API
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

    let ownerCompanyId;
    try {
        if (!adminDb) throw new Error("Firestore is not configured.");
        const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
        if (companyQuery.empty) {
          throw new Error("La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos.");
        }
        ownerCompanyId = companyQuery.docs[0].id;
    } catch (dbError: any) {
        console.error('[Server Action DB Error]', dbError);
        return { success: false, message: `Error de base de datos: ${dbError.message}` };
    }

    const jobPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", 
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
    console.log(`[Server Action] Calling public API endpoint: ${targetUri}`);

    try {
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
        const errorDetails = error.response?.data?.details?.message || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        return { success: false, message: errorMessage };
    }
}
