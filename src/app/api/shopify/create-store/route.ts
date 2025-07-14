
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';
import { getPartnerCredentials } from '@/lib/api-helpers';
import { getServiceAccountCredentials } from '@/lib/firebase-admin';


// This API route handles requests to create new Shopify stores.
// It validates the input, creates a job record in Firestore, and enqueues a Cloud Task.

export const dynamic = 'force-dynamic';

const shopifyStoreCreationSchema = z.object({
  webhookUrl: z.string().url({ message: "La URL del webhook no es válida." }),
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  businessEmail: z.string().email("El email del negocio no es válido."),
  countryCode: z.string().length(2, "El código de país debe tener 2 caracteres.").optional(),
  currency: z.string().length(3, "El código de moneda debe tener 3 caracteres.").optional(),
  brandDescription: z.string().min(1, "La descripción de la marca es obligatoria."),
  targetAudience: z.string().min(1, "El público objetivo es obligatorio."),
  brandPersonality: z.string().min(1, "La personalidad de la marca es obligatoria."),
  colorPaletteSuggestion: z.string().optional(),
  productTypeDescription: z.string().min(1, "La descripción del tipo de producto es obligatoria."),
  creationOptions: z.object({
    createExampleProducts: z.boolean(),
    numberOfProducts: z.number().min(0).max(10).optional(),
    createAboutPage: z.boolean(),
    createContactPage: z.boolean(),
    createLegalPages: z.boolean(),
    createBlogWithPosts: z.boolean(),
    numberOfBlogPosts: z.number().min(0).max(5).optional(),
    setupBasicNav: z.boolean(),
    theme: z.string().optional(),
  }),
  legalInfo: z.object({
    legalBusinessName: z.string().min(1, "El nombre legal del negocio es obligatorio."),
    businessAddress: z.string().min(1, "La dirección del negocio es obligatoria."),
  }),
  entity: z.object({
    type: z.enum(['user', 'company']),
    id: z.string(),
  })
});

const testCreationSchema = z.object({
  isTest: z.boolean().optional(),
});


async function enqueueShopifyCreationTask(jobId: string) {
    console.log(`[Shopify Create Store] Step 5.1: Enqueuing task for Job ID: ${jobId}`);
    
    // Explicitly get credentials first.
    const credentials = getServiceAccountCredentials();
    const serviceAccountEmail = credentials.clientEmail;
    
    if (!serviceAccountEmail) {
        throw new Error('No se pudo obtener el email de la cuenta de servicio desde las credenciales.');
    }

    const tasksClient = new CloudTasksClient({ credentials });

    const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
    const LOCATION_ID = 'europe-west1'; 
    const QUEUE_ID = 'autopress-jobs';
    
    if (!PROJECT_ID) {
        throw new Error('FIREBASE_PROJECT_ID no está configurado en las variables de entorno.');
    }

    const parent = tasksClient.queuePath(PROJECT_ID, LOCATION_ID, QUEUE_ID);
    const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/create-shopify-store`;

    const task = {
        httpRequest: {
            httpMethod: 'POST' as const,
            url: targetUri,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
            oidcToken: { serviceAccountEmail },
        },
    };

    console.log(`[Shopify Create Store] Step 5.2: About to create task with payload for URI: ${targetUri}`);
    const [response] = await tasksClient.createTask({ parent, task });
    console.log(`[Shopify Create Store] Step 5.3: Task created successfully: ${response.name}`);
    return response;
}


async function handleTestCreation(uid: string) {
    console.log(`[Shopify Create Store] Test Call: Generating test data...`);
    if (!adminDb) {
      throw new Error("Firestore is not configured.");
    }
    
    const timestamp = Date.now();
    const storeData = {
        storeName: `Tienda de Prueba ${timestamp}`,
        businessEmail: `test-${timestamp}@example.com`,
    };
    
    const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
    if (companyQuery.empty) {
      throw new Error("La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos.");
    }
    const ownerCompanyId = companyQuery.docs[0].id;
    console.log(`[Shopify Create Store] Test Call: Found owner company ID: ${ownerCompanyId}`);

    const jobPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", 
      storeName: storeData.storeName,
      businessEmail: storeData.businessEmail,
      countryCode: "ES",
      currency: "EUR",
      brandDescription: "Una tienda de prueba generada automáticamente para verificar el flujo de creación de AutoPress AI.",
      targetAudience: "Desarrolladores y equipo de producto.",
      brandPersonality: "Funcional, robusta y eficiente.",
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
        legalBusinessName: "AutoPress Testing SL",
        businessAddress: "Calle Ficticia 123, 08001, Barcelona, España",
      },
      entity: {
        type: 'company' as 'user' | 'company',
        id: ownerCompanyId,
      }
    };
    console.log(`[Shopify Create Store] Test Call: Test data generated successfully.`);
    return jobPayload;
}


export async function POST(req: NextRequest) {
    console.log(`[Shopify Create Store] Step 1: POST request received.`);
  try {
    const providedApiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    let uid: string | null = null;
    let isTestCall = false;

    // --- Authentication: Check for internal user call OR external API key call ---
    if (providedApiKey) {
      try {
        if (!adminAuth) throw new Error("Firebase Admin Auth no está inicializado.");
        const decodedToken = await adminAuth.verifyIdToken(providedApiKey);
        uid = decodedToken.uid;
        console.log(`[Shopify Create Store] Step 1.1: Authenticated via Firebase token. UID: ${uid}`);
      } catch (firebaseError) {
        console.log(`[Shopify Create Store] Step 1.1: Not a Firebase token. Checking for system API key...`);
        // If it's not a Firebase token, treat it as a potential API key
        const partnerCreds = await getPartnerCredentials();
        const serverApiKey = partnerCreds.automationApiKey;
        if (!serverApiKey) {
          throw new Error('Servicio de automatización no configurado en el servidor.');
        }
        if (providedApiKey !== serverApiKey) {
          throw new Error('No autorizado: Clave de API no válida.');
        }
         console.log(`[Shopify Create Store] Step 1.1: Authenticated via system API key.`);
      }
    } else {
        throw new Error('No autorizado: Falta el token de autenticación o la clave de API.');
    }
    
    if (!adminDb) {
      return NextResponse.json({ error: 'Servicio de base de datos no disponible.' }, { status: 503 });
    }

    const body = await req.json();
    console.log(`[Shopify Create Store] Step 2: Request body parsed.`);
    
    // --- Determine if it's a test call ---
    const testCheck = testCreationSchema.safeParse(body);
    if (uid && testCheck.success && testCheck.data.isTest) {
        isTestCall = true;
        console.log(`[Shopify Create Store] Step 2.1: Detected as a test call.`);
    }

    let jobData: z.infer<typeof shopifyStoreCreationSchema>;

    if (isTestCall) {
        if (!uid) throw new Error("La llamada de prueba debe provenir de un usuario autenticado.");
        jobData = await handleTestCreation(uid);
    } else {
        const validation = shopifyStoreCreationSchema.safeParse(body);
        if (!validation.success) {
            console.error('[Shopify Create Store] Step 2.1: Schema validation failed.', validation.error.flatten());
            return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validation.error.flatten() }, { status: 400 });
        }
        jobData = validation.data;
        console.log(`[Shopify Create Store] Step 2.1: Schema validated successfully for a standard call.`);
    }
    
    const { entity } = jobData;
    const settingsCollection = entity.type === 'company' ? 'companies' : 'user_settings';
    const entityDoc = await adminDb.collection(settingsCollection).doc(entity.id).get();
    if (!entityDoc.exists) {
        throw new Error(`La entidad especificada (${entity.type}: ${entity.id}) no existe.`);
    }
    console.log(`[Shopify Create Store] Step 3: Entity verified: ${entity.type} with ID ${entity.id}.`);

    const jobRef = adminDb.collection('shopify_creation_jobs').doc();
    await jobRef.set({
      ...jobData,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y encolado.' }]
    });
    console.log(`[Shopify Create Store] Step 4: Firestore job document created with ID: ${jobRef.id}`);

    const jobId = jobRef.id;
    await enqueueShopifyCreationTask(jobId);
    console.log(`[Shopify Create Store] Step 5: Task enqueued successfully.`);

    return NextResponse.json({ success: true, jobId: jobId }, { status: 202 });

  } catch (error: any) {
    console.error('Error creating Shopify creation job:', { 
        message: error.message, 
        stack: error.stack,
        code: error.code,
        details: error.response?.data || error
    });
    const status = error.message?.includes('No autorizado') ? 401 : 500;
    return NextResponse.json({ 
        error: 'No se pudo crear el trabajo.', 
        details: { message: error.message, stack: error.stack, code: error.code }
    }, { status });
  }
}
