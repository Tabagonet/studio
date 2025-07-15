
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';

// This API route is now responsible only for creating the initial job document.
// The assignment of a store and the authorization flow are handled by other endpoints.

export const dynamic = 'force-dynamic';

// Schema is now much simpler, only receiving the initial request data.
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


export async function POST(req: NextRequest) {
    console.log(`[Shopify Job] Step 1: POST request received to create a new job.`);
  try {
    const providedApiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!providedApiKey) {
        throw new Error('No autorizado: Falta el token de autenticación o la clave de API.');
    }

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
    
    const validation = shopifyJobCreationSchema.safeParse(body);
    if (!validation.success) {
        console.error('[Shopify Job] Step 2.1: Schema validation failed.', validation.error.flatten());
        return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validation.error.flatten() }, { status: 400 });
    }
    const jobData = validation.data;
    console.log(`[Shopify Job] Step 2.1: Schema validated successfully for job: ${jobData.storeName}`);
    
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
