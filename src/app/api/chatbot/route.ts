
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractAnalysisData, extractStoreCreationData } from '@/ai/flows/chatbot-flow';
import { adminDb, admin } from '@/lib/firebase-admin';
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
        console.error("RECAPTCHA_SECRET_KEY is not set in environment variables. Chatbot verification is not possible.");
        throw new Error("El servicio de chatbot no está configurado correctamente en el servidor.");
    }
    if (!token || token === 'not-available') {
        throw new Error("Verificación de seguridad reCAPTCHA fallida. Por favor, refresca la página e inténtalo de nuevo.");
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
    const inquiryData = await extractAnalysisData(messages);
    if (adminDb) {
        try {
            const newProspectRef = adminDb.collection('prospects').doc();
            await newProspectRef.set({
                name: inquiryData.name || 'No Proporcionado',
                email: inquiryData.email || 'No Proporcionado',
                companyUrl: inquiryData.companyUrl || 'No Proporcionado',
                inquiryData: {
                    objective: inquiryData.objective || '',
                    businessDescription: inquiryData.businessDescription || '',
                    valueProposition: inquiryData.valueProposition || '',
                    targetAudience: inquiryData.targetAudience || '',
                    competitors: inquiryData.competitors || '',
                    brandPersonality: inquiryData.brandPersonality || '',
                    monthlyBudget: inquiryData.monthlyBudget || '',
                },
                status: 'new', source: 'chatbot_analysis',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            const superAdminsSnapshot = await adminDb.collection('users').where('role', '==', 'super_admin').get();
            if (!superAdminsSnapshot.empty) {
                const notificationBatch = adminDb.batch();
                superAdminsSnapshot.docs.forEach(adminDoc => {
                    const notificationRef = adminDb.collection('notifications').doc();
                    notificationBatch.set(notificationRef, {
                        recipientUid: adminDoc.id, type: 'new_prospect', title: 'Nuevo Prospecto de Análisis Capturado',
                        message: `El lead "${inquiryData.name || inquiryData.email}" ha completado el cuestionario de análisis.`,
                        link: '/prospects', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                });
                await notificationBatch.commit();
            }
        } catch (dbError) {
             console.error("Failed to create prospect for analysis:", dbError);
        }
    }
    return '¡Genial! Hemos recibido toda la información. Uno de nuestros expertos la revisará y se pondrá en contacto contigo muy pronto. ¡Gracias!';
}

async function getOwnerCompanyId(): Promise<string> {
    if (!adminDb) {
      throw new Error("Firestore is not configured.");
    }
    // "Grupo 4 alas S.L." is the owner company. We find its ID to assign the new store to it.
    const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
    if (companyQuery.empty) {
      throw new Error("Owner company 'Grupo 4 alas S.L.' not found in the database.");
    }
    return companyQuery.docs[0].id;
}


async function handleStoreCreation(messages: Message[]) {
    const storeData = await extractStoreCreationData(messages);
    const ownerCompanyId = await getOwnerCompanyId();

    const apiPayload = {
      webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", // Test webhook
      storeName: storeData.storeName,
      businessEmail: storeData.businessEmail,
      countryCode: storeData.countryCode?.substring(0,2).toUpperCase() || 'ES',
      currency: storeData.currency?.substring(0,3).toUpperCase() || 'EUR',
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
      }
    };
    
    const createStoreUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`;
    await axios.post(createStoreUrl, apiPayload, {
      headers: {
        'Authorization': `Bearer ${process.env.SHOPIFY_AUTOMATION_API_KEY}`
      }
    });

    return `¡Perfecto! Hemos recibido los datos. Estamos iniciando la creación de tu tienda Shopify: "${storeData.storeName}". Recibirás una notificación cuando esté lista para que la autorices.`;
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
