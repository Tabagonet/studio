// src/app/(app)/dashboard/actions.ts
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';

// This server action is now a secure proxy to call our internal API endpoint.
// It uses the user's authentication to authorize itself.
export async function triggerShopifyCreationTestAction(token: string): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Iniciando Shopify creation test...');
    
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

    if (!process.env.NEXT_PUBLIC_BASE_URL || !adminDb) {
        console.error('[Server Action Config Error] NEXT_PUBLIC_BASE_URL or adminDb is not configured.');
        return { success: false, message: 'Error de configuración del servidor.' };
    }

    try {
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
        console.log('[Server Action] Test store data generated.');

        const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
        if (companyQuery.empty) {
            throw new Error("La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos.");
        }
        const ownerCompanyId = companyQuery.docs[0].id;

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
        console.log(`[Server Action] Calling public API at ${targetUri}`);
        
        const response = await axios.post(targetUri, jobPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`,
            }
        });
        
        console.log(`[Server Action] Public API responded with status ${response.status}.`);

        const jobId = response.data.jobId;
        console.log('[Server Action] Job creation successfully triggered by the API. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        const errorDetails = error.response?.data?.details || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        console.error('[Server Action] Error during job creation call:', errorMessage);
        return { success: false, message: errorMessage };
    }
}