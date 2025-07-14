
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';

/**
 * Handles the logic for initiating a Shopify store creation process.
 * It now calls the dedicated /api/shopify/create-store endpoint.
 */
export async function handleStoreCreationAction() {
    if (!adminDb) {
      throw new Error("Firestore is not configured.");
    }
    
    // This is the API key our own server expects for this protected endpoint.
    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        throw new Error("La clave SHOPIFY_AUTOMATION_API_KEY no está configurada en el servidor.");
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
        type: 'company',
        id: ownerCompanyId,
      }
    };
    
    // Call our own API to create the job and enqueue the task
    await axios.post(`${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`, jobPayload, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalApiKey}`,
        }
    });
    
    return `¡Perfecto! Usando datos de ejemplo, estamos iniciando la creación de tu tienda Shopify: "${storeData.storeName}". Ve al panel de "Trabajos de Creación" para ver el progreso.`;
}
