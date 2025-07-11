import { NextRequest, NextResponse } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';

export const dynamic = 'force-dynamic';

const shopifyStoreCreationSchema = z.object({
  webhookUrl: z.string().url({ message: "La URL del webhook no es válida." }),
  storeName: z.string().min(3, "El nombre de la tienda debe tener al menos 3 caracteres."),
  businessEmail: z.string().email("El email del negocio no es válido."),
  countryCode: z.string().length(2, "El código de país debe tener 2 caracteres."),
  currency: z.string().length(3, "El código de moneda debe tener 3 caracteres."),
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

    // Check site limit based on the entity requesting the store
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
    // Note: A limit check for 'company' type entities is not implemented, as limits are per-user.

    const jobRef = adminDb.collection('shopify_creation_jobs').doc();
    
    await jobRef.set({
      ...validation.data,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      logs: [{ timestamp: new Date(), message: 'Trabajo creado y encolado.' }]
    });

    const jobId = jobRef.id;

    // In a production environment with Cloud Tasks, this would enqueue a task
    // instead of calling the handler directly.
    handleCreateShopifyStore(jobId);

    return NextResponse.json({ success: true, jobId: jobId }, { status: 202 });

  } catch (error: any) {
    console.error('Error creating Shopify creation job:', error);
    return NextResponse.json({ error: 'No se pudo crear el trabajo.', details: error.message }, { status: 500 });
  }
}
