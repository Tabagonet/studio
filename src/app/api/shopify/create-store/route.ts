
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin, adminAuth, getServiceAccountCredentials } from '@/lib/firebase-admin';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';

// This API route handles requests to populate Shopify stores.
// It validates the input, creates a job record in Firestore, and enqueues a Cloud Task.

export const dynamic = 'force-dynamic';

const shopifyStoreCreationSchema = z.object({
  // Required fields for identifying the store and its access
  storeDomain: z.string().min(3, "Se requiere un dominio de tienda válido."),
  adminApiAccessToken: z.string().min(10, "Se requiere un token de acceso de la API de Admin."),
  
  // Client-facing details
  webhookUrl: z.string().url({ message: "La URL del webhook no es válida." }),
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  businessEmail: z.string().email("El email del negocio no es válido."),
  
  // Content generation context
  brandDescription: z.string().min(1, "La descripción de la marca es obligatoria."),
  targetAudience: z.string().min(1, "El público objetivo es obligatorio."),
  brandPersonality: z.string().min(1, "La personalidad de la marca es obligatoria."),
  colorPaletteSuggestion: z.string().optional(),
  productTypeDescription: z.string().min(1, "La descripción del tipo de producto es obligatoria."),
  
  // Customization options
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

  // Legal information for page generation
  legalInfo: z.object({
    legalBusinessName: z.string().min(1, "El nombre legal del negocio es obligatorio."),
    businessAddress: z.string().min(1, "La dirección del negocio es obligatoria."),
  }),

  // Ownership entity within AutoPress AI
  entity: z.object({
    type: z.enum(['user', 'company']),
    id: z.string(),
  })
});

export async function POST(req: NextRequest) {
    console.log(`[Shopify Job] Step 1: POST request received.`);
  try {
    const providedApiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!providedApiKey) {
        throw new Error('No autorizado: Falta el token de autenticación o la clave de API.');
    }

    // Auth: Allow both user-based tokens and system-wide API keys
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth no está inicializado.");
        await adminAuth.verifyIdToken(providedApiKey);
        console.log(`[Shopify Job] Authenticated via Firebase token.`);
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
    
    const validation = shopifyStoreCreationSchema.safeParse(body);
    if (!validation.success) {
        console.error('[Shopify Job] Step 2.1: Schema validation failed.', validation.error.flatten());
        return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validation.error.flatten() }, { status: 400 });
    }
    const jobData = validation.data;
    console.log(`[Shopify Job] Step 2.1: Schema validated successfully for store: ${jobData.storeDomain}`);
    
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
      status: 'assigned', // New status for the new workflow
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y asignado. Encolando tarea de población de contenido.' }]
    });
    console.log(`[Shopify Job] Step 4: Firestore job document created with ID: ${jobRef.id}`);

    const jobId = jobRef.id;
    if (process.env.NODE_ENV === 'development') {
        console.log(`[Shopify Job] Step 5: DEV MODE - Calling population task handler directly for Job ID: ${jobId}`);
        const { populateShopifyStore } = require('@/lib/tasks/populate-shopify-store');
        populateShopifyStore(jobId).catch((e: any) => {
            console.error(`[DEV Direct Call] Error executing task for job ${jobId}:`, e);
        });
    } else {
        const tasksClient = new CloudTasksClient({
          credentials: getServiceAccountCredentials(),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });
        
        const parent = tasksClient.queuePath(process.env.FIREBASE_PROJECT_ID!, 'europe-west1', 'autopress-jobs');
        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;
        const task = {
            httpRequest: {
                httpMethod: 'POST' as const,
                url: targetUri,
                headers: { 'Content-Type': 'application/json' },
                body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
                oidcToken: { serviceAccountEmail: getServiceAccountCredentials().client_email },
            },
        };
        await tasksClient.createTask({ parent, task });
    }
    
    console.log(`[Shopify Job] Step 6: Task processing for content population initiated.`);

    return NextResponse.json({ success: true, jobId: jobId }, { status: 202 });

  } catch (error: any) {
    console.error('Error creating Shopify population job:', { 
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
