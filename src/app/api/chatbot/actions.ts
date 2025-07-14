
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
const LOCATION_ID = 'europe-west1';
const QUEUE_ID = 'autopress-jobs';

async function enqueueShopifyCreationTask(jobId: string) {
    if (!PROJECT_ID) {
      throw new Error('FIREBASE_PROJECT_ID no está configurado en las variables de entorno.');
    }
  
    const parent = tasksClient.queuePath(PROJECT_ID, LOCATION_ID, QUEUE_ID);
    const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL;
    
    if (!serviceAccountEmail) {
      throw new Error('FIREBASE_CLIENT_EMAIL no está configurado. Es necesario para autenticar las tareas.');
    }
    
    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/create-shopify-store`;
  
    const task = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: targetUri,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
         oidcToken: {
            serviceAccountEmail: serviceAccountEmail,
         },
      },
      scheduleTime: {
        seconds: Date.now() / 1000 + 5,
      },
    };
  
    const request = { parent: parent, task: task };
    const [response] = await tasksClient.createTask(request);
    console.log(`[Cloud Task] Creada la tarea: ${response.name}`);
    return response;
}


/**
 * Handles the logic for initiating a Shopify store creation process.
 * This is a server action, so it has access to Node.js environment variables.
 */
export async function handleStoreCreationAction() {
    if (!adminDb) {
      throw new Error("Firestore is not configured.");
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
      },
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y encolado desde el chatbot.' }]
    };
    
    const jobRef = await adminDb.collection('shopify_creation_jobs').add(jobPayload);
    
    await enqueueShopifyCreationTask(jobRef.id);

    return `¡Perfecto! Usando datos de ejemplo, estamos iniciando la creación de tu tienda Shopify: "${storeData.storeName}". Ve al panel de "Trabajos de Creación" para ver el progreso.`;
}
