
import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';

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


export async function POST(req: NextRequest) {
  const providedApiKey = req.headers.get('Authorization')?.split('Bearer ')[1];
  const serverApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;

  if (!serverApiKey) {
    console.error('SHOPIFY_AUTOMATION_API_KEY is not set on the server.');
    return NextResponse.json({ error: 'Servicio de automatización no configurado en el servidor.' }, { status: 500 });
  }

  if (providedApiKey !== serverApiKey) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }

  if (!adminDb) {
    return NextResponse.json({ error: 'Servicio de base de datos no disponible.' }, { status: 503 });
  }

  const body = await req.json();
  const validation = shopifyStoreCreationSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validation.error.flatten() }, { status: 400 });
  }

  try {
    const { entity } = validation.data;
    const settingsCollection = entity.type === 'company' ? 'companies' : 'user_settings';
    const entityDoc = await adminDb.collection(settingsCollection).doc(entity.id).get();

    if (!entityDoc.exists) {
        throw new Error(`La entidad especificada (${entity.type}: ${entity.id}) no existe.`);
    }

    const entityData = entityDoc.data()!;
    const partnerAppData = entityData.connections?.partner_app;

    if (!partnerAppData || !partnerAppData.partnerApiToken || !partnerAppData.organizationId) {
        return NextResponse.json({ error: 'La entidad no tiene una conexión de Shopify Partner activa. Por favor, conecta tu cuenta en Ajustes > Conexiones.' }, { status: 403 });
    }
    
    // Site limit check can remain if it's a per-user limit.
    if (entity.type === 'user') {
        const userDoc = await adminDb.collection('users').doc(entity.id).get();
        if (!userDoc.exists) throw new Error("El usuario especificado para crear la tienda no existe.");
        
        const userData = userDoc.data()!;
        const siteLimit = userData.siteLimit ?? 1;

        const jobsSnapshot = await adminDb.collection('shopify_creation_jobs')
            .where('entity.id', '==', entity.id)
            .where('entity.type', '==', 'user')
            .count()
            .get();
        
        const jobsCount = jobsSnapshot.data().count;

        if (jobsCount >= siteLimit) {
            return NextResponse.json({ error: `Límite de creación de tiendas (${siteLimit}) alcanzado para este usuario.` }, { status: 403 });
        }
    }

    const jobRef = adminDb.collection('shopify_creation_jobs').doc();
    
    await jobRef.set({
      ...validation.data,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y encolado.' }]
    });

    const jobId = jobRef.id;

    await enqueueShopifyCreationTask(jobId);

    // This is the immediate response to the chatbot
    return NextResponse.json({ success: true, jobId: jobId }, { status: 202 });

  } catch (error: any) {
    console.error('Error creating Shopify creation job:', error);
    return NextResponse.json({ error: 'No se pudo crear el trabajo.', details: error.message }, { status: 500 });
  }
}
