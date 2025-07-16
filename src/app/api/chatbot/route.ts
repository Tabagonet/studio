// src/app/api/chatbot/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractAnalysisData } from '@/ai/flows/chatbot-flow';
import { adminDb } from '@/lib/firebase-admin';
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
    if (!adminDb) {
      console.error("Firestore not configured. Cannot save prospect.");
      return 'Error: La base de datos no está disponible.';
    }

    try {
        const data = await extractAnalysisData(messages);
        
        // Save the prospect to Firestore
        await adminDb.collection('prospects').add({
            name: data.name,
            email: data.email,
            companyUrl: data.companyUrl,
            inquiryData: {
                objective: data.objective,
                businessDescription: data.businessDescription,
                valueProposition: data.valueProposition,
                targetAudience: data.targetAudience,
                competitors: data.competitors,
                brandPersonality: data.brandPersonality,
                monthlyBudget: data.monthlyBudget,
            },
            status: 'new',
            source: 'chatbot_v2',
            createdAt: new Date(),
        });

        return '¡Genial! Hemos recibido toda la información. Uno de nuestros expertos la revisará y se pondrá en contacto contigo muy pronto. ¡Gracias!';
    } catch(e) {
        console.error("Error saving prospect data:", e);
        return 'He guardado tus respuestas, pero ha habido un problema al registrar tus datos de contacto. No te preocupes, un asesor lo revisará igualmente.';
    }
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
        
        return NextResponse.json({ response: aiResponseText, isComplete: false });

    } catch (error: any) {
        console.error('Error in /api/chatbot POST handler:', error);
        return NextResponse.json({ error: 'Failed to get response from chatbot AI', message: error.message }, { status: 500 });
    }
}
