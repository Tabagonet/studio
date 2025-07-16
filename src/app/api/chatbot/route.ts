// src/app/api/chatbot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractAnalysisData } from '@/ai/flows/chatbot-flow';
import { adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { z } from 'zod';

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
        console.warn("RECAPTCHA_SECRET_KEY is not set. Bypassing reCAPTCHA verification for development.");
        return true;
    }
    
    if (!token || token === 'not-available') {
        throw new Error("La verificación de seguridad reCAPTCHA no estaba lista. Por favor, refresca la página e inténtalo de nuevo.");
    }
    
    try {
        const response = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Google reCAPTCHA API request failed with status ${response.status}`);
        }
        const data = await response.json();

        if (!data.success || data.score < 0.5) {
            console.warn(`reCAPTCHA verification failed or score too low. Score: ${data.score}`, data['error-codes']);
            throw new Error("La verificación de reCAPTCHA ha fallado. Inténtalo de nuevo.");
        }
        return true;
    } catch (error: any) {
        console.error("Error during reCAPTCHA verification:", error.message);
        if (error.message.includes("La verificación de reCAPTCHA ha fallado")) {
            throw error;
        }
        throw new Error("No se pudo contactar con el servicio de reCAPTCHA. Inténtalo de nuevo más tarde.");
    }
}

async function handleAnalysisCompletion(messages: Message[]) {
    // This function is kept for the strategic analysis flow, but is not used for store creation.
    return '¡Genial! Hemos recibido toda la información. Uno de nuestros expertos la revisará y se pondrá en contacto contigo muy pronto. ¡Gracias!';
}


/**
 * Handles the logic for initiating a Shopify store creation process.
 * It now calls the dedicated /api/shopify/create-store endpoint.
 */
async function triggerStoreCreationWithExampleData() {
    if (!adminDb) {
      throw new Error("Firestore is not configured.");
    }
    
    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        throw new Error("La clave SHOPIFY_AUTOMATION_API_KEY no está configurada en el servidor.");
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
    
    const jobPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", 
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
    
    // Call our own API to create the job.
    await axios.post(`${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`, jobPayload, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${internalApiKey}`,
        }
    });
    
    return `¡Perfecto! Usando datos de ejemplo, hemos creado una solicitud de trabajo para: "${storeData.storeName}". Ve al panel de "Trabajos" para asignarle una tienda de desarrollo y continuar el proceso.`;
}


export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const validation = chatbotRequestSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request body', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { messages, recaptchaToken } = validation.data;
        
        // Only verify reCAPTCHA on the first message from a new user.
        if (messages.length === 0) {
            await verifyRecaptcha(recaptchaToken);
        }
        
        const aiResponseText = await getChatbotResponse(messages);
        
        const trimmedResponse = aiResponseText.trim().toUpperCase();

        if (trimmedResponse === 'FIN-ANALISIS') {
            const responseMessage = await handleAnalysisCompletion(messages);
            return NextResponse.json({ response: responseMessage, isComplete: true });
        }

        if (trimmedResponse === 'FIN-TIENDA') {
            const responseMessage = await triggerStoreCreationWithExampleData();
            return NextResponse.json({ response: responseMessage, isComplete: true });
        }
        
        return NextResponse.json({ response: aiResponseText, isComplete: false });

    } catch (error: any) {
        console.error('Error in /api/chatbot POST handler:', error);
        return NextResponse.json({ error: 'Failed to get response from chatbot AI', message: error.message }, { status: 500 });
    }
}
