
'use server';

import { adminDb, admin } from '@/lib/firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

// This is a server action, designed to be called from a client component.
// It now contains the full logic to create the job and enqueue the task.

const tasksClient = new CloudTasksClient();
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
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
      seconds: Date.now() / 1000 + 5, // Schedule 5 seconds in the future.
    },
  };

  console.log(`[Server Action] Enqueuing task for Job ID: ${jobId} to target ${targetUri}`);
  const [response] = await tasksClient.createTask({ parent, task });
  console.log(`[Server Action] Task created: ${response.name}`);
  return response;
}


export async function triggerShopifyCreationTestAction(): Promise<{ success: boolean; message: string; jobId?: string; }> {
    console.log('[Server Action] Triggering Shopify Creation Test...');

    const serverApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!serverApiKey) {
        console.error("[Server Action Error] SHOPIFY_AUTOMATION_API_KEY is not configured on the server.");
        // This is the error we were seeing, confirming the action can read the env var.
        return { success: false, message: "Servicio de automatización no configurado en el servidor." };
    }
    
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
          logs: [{ timestamp: new Date(), message: 'Trabajo creado y encolado desde el botón de prueba.' }]
        });
    
        const jobId = jobRef.id;

        await enqueueShopifyCreationTask(jobId);

        console.log('[Server Action] Job enqueued successfully. Job ID:', jobId);
        return { success: true, message: '¡Trabajo de creación de tienda enviado! Revisa el progreso en la sección de Trabajos.', jobId: jobId };

    } catch (error: any) {
        console.error('[Server Action Error] Failed to trigger store creation:', error);
        return { success: false, message: `No se pudo iniciar el trabajo: ${error.message}` };
    }
}
