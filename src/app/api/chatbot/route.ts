
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse } from '@/ai/flows/chatbot-flow';
import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import { z } from 'zod';
import { CloudTasksClient } from '@google-cloud/tasks';


interface Message {
    role: 'user' | 'model';
    content: string;
}

const chatbotRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'model']),
    content: z.string(),
  })),
  recaptchaToken: z.string().optional(),
});


async function verifyRecaptcha(token: string | undefined) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    if (!secretKey) {
        console.warn("RECAPTCHA_SECRET_KEY is not set. Bypassing reCAPTCHA verification. THIS SHOULD NOT HAPPEN IN PRODUCTION.");
        return true;
    }
    
    if (!token || token === 'not-available') {
        console.warn("reCAPTCHA token not provided by client, but secret key is set. Failing verification.");
        throw new Error("La verificación de seguridad reCAPTCHA ha fallado. Por favor, refresca la página e inténtalo de nuevo.");
    }
    
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    
    try {
        const response = await axios.post(verificationUrl);
        const { success, score } = response.data;
        if (!success || score < 0.5) {
            console.warn(`reCAPTCHA verification failed or score too low. Score: ${score}`, response.data['error-codes']);
            throw new Error("La verificación de reCAPTCHA ha fallado. Inténtalo de nuevo.");
        }
        return true;
    } catch (error: any) {
        if (error.message.includes("La verificación de reCAPTCHA ha fallado")) {
            throw error;
        }
        console.error("Error during reCAPTCHA verification API request:", error.message);
        throw new Error("No se pudo contactar con el servicio de reCAPTCHA. Inténtalo de nuevo más tarde.");
    }
}

async function handleAnalysisCompletion(messages: Message[]) {
    // This function is kept for the strategic analysis flow, but is not used for store creation.
    return '¡Genial! Hemos recibido toda la información. Uno de nuestros expertos la revisará y se pondrá en contacto contigo muy pronto. ¡Gracias!';
}

async function enqueueShopifyCreationTask(jobId: string) {
    const tasksClient = new CloudTasksClient();
    const PROJECT_ID = process.env.FIREBASE_PROJECT_ID!;
    const LOCATION_ID = 'europe-west1'; 
    const QUEUE_ID = 'autopress-jobs';

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
        headers: { 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
        oidcToken: { serviceAccountEmail },
      },
    };
    await tasksClient.createTask({ parent, task });
    console.log(`[Chatbot API] Enqueued task for Shopify creation job: ${jobId}`);
}


async function handleStoreCreation(messages: Message[]) {
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
      throw new Error("Owner company 'Grupo 4 alas S.L.' not found in the database.");
    }
    const ownerCompanyId = companyQuery.docs[0].id;
    
    const jobPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", // Test webhook
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
      logs: [{ timestamp: new Date(), message: 'Trabajo creado desde el chatbot y encolado.' }]
    };

    const jobRef = await adminDb.collection('shopify_creation_jobs').add(jobPayload);
    
    // Now, enqueue the background task to process this job
    await enqueueShopifyCreationTask(jobRef.id);

    return `¡Perfecto! Usando datos de ejemplo, estamos iniciando la creación de tu tienda Shopify: "${storeData.storeName}". Ve al panel para ver el progreso.`;
}


export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const validation = chatbotRequestSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request body', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { messages, recaptchaToken } = validation.data;
        
        await verifyRecaptcha(recaptchaToken);
        
        const aiResponseText = await getChatbotResponse(messages);
        
        const trimmedResponse = aiResponseText.trim().toUpperCase();

        if (trimmedResponse === 'FIN-ANALISIS') {
            const responseMessage = await handleAnalysisCompletion(messages);
            return NextResponse.json({ response: responseMessage, isComplete: true });
        }

        if (trimmedResponse === 'FIN-TIENDA') {
            const responseMessage = await handleStoreCreation(messages);
            return NextResponse.json({ response: responseMessage, isComplete: true });
        }
        
        return NextResponse.json({ response: aiResponseText, isComplete: false });

    } catch (error: any) {
        console.error('Error in chatbot API route:', error);
        return NextResponse.json({ error: error.message || 'Failed to get response from chatbot AI' }, { status: 500 });
    }
}
