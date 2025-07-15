
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';

// This API route handles requests to create new Shopify jobs.
// It validates the input and creates a job record in Firestore.

export const dynamic = 'force-dynamic';

const shopifyJobCreationSchema = z.object({
  webhookUrl: z.string().url({ message: "La URL del webhook no es válida." }),
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  businessEmail: z.string().email("El email del negocio no es válido."),
  
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


async function handleTestCreation(uid: string) {
    console.log(`[Shopify Job] Test Call: Generating test data for user ${uid}...`);
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
    console.log(`[Shopify Job] Test Call: Found owner company ID: ${ownerCompanyId}`);

    const jobPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", // Placeholder
      storeName: storeData.storeName,
      businessEmail: storeData.businessEmail,
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
    console.log(`[Shopify Job] Test Call: Test data generated successfully.`);
    return jobPayload;
}


export async function POST(req: NextRequest) {
    console.log(`[Shopify Job] Step 1: POST request received to create a new job.`);
  try {
    const providedApiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    let uid: string | null = null;
    let isTestCall = false;

    if (!providedApiKey) {
        throw new Error('No autorizado: Falta el token de autenticación o la clave de API.');
    }

    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth no está inicializado.");
        const decodedToken = await adminAuth.verifyIdToken(providedApiKey);
        uid = decodedToken.uid;
        console.log(`[Shopify Job] Authenticated via Firebase token. UID: ${uid}`);
    } catch (firebaseError) {
        console.log(`[Shopify Job] Not a Firebase token. Checking for system API key...`);
        const serverApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
        if (!serverApiKey || providedApiKey !== serverApiKey) {
            throw new Error('No autorizado: Clave de API no válida.');
        }
        console.log(`[Shopify Job] Authenticated via system API key.`);
    }
    
    if (!adminDb) {
      return NextResponse.json({ error: 'Servicio de base de datos no disponible.' }, { status: 503 });
    }

    const body = await req.json();
    console.log(`[Shopify Job] Step 2: Request body parsed.`);
    
    const testCheck = testCreationSchema.safeParse(body);
    if (testCheck.success && testCheck.data.isTest) {
        isTestCall = true;
        console.log(`[Shopify Job] Step 2.1: Detected as a test call.`);
    }

    let jobData: z.infer<typeof shopifyJobCreationSchema>;

    if (isTestCall) {
        if (!uid) throw new Error("La llamada de prueba debe provenir de un usuario autenticado.");
        jobData = await handleTestCreation(uid);
    } else {
        const validation = shopifyJobCreationSchema.safeParse(body);
        if (!validation.success) {
            console.error('[Shopify Job] Step 2.1: Schema validation failed.', validation.error.flatten());
            return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validation.error.flatten() }, { status: 400 });
        }
        jobData = validation.data;
        console.log(`[Shopify Job] Step 2.1: Schema validated successfully for job: ${jobData.storeName}`);
    }
    
    const { entity } = jobData;
    const settingsCollection = entity.type === 'company' ? 'companies' : 'user_settings';
    const entityDoc = await adminDb.collection(settingsCollection).doc(entity.id).get();
    if (!entityDoc.exists) {
        throw new Error(`La entidad especificada (${entity.type}: ${entity.id}) no existe.`);
    }
    console.log(`[Shopify Job] Step 3: Entity verified: ${entity.type} with ID ${entity.id}.`);

    const jobRef = adminDb.collection('shopify_creation_jobs').doc();
    await jobRef.set({
      ...jobData,
      status: 'pending', // The job starts here, waiting for a store to be assigned.
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y pendiente de asignación de tienda.' }]
    });
    console.log(`[Shopify Job] Step 4: Firestore job document created with ID: ${jobRef.id}`);

    return NextResponse.json({ success: true, jobId: jobRef.id }, { status: 202 });

  } catch (error: any) {
    console.error('Error creating Shopify job:', { 
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
