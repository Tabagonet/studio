import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse } from '@/ai/flows/chatbot-flow';
import axios from 'axios';
import { z } from 'zod';
import { handleStoreCreationAction } from './actions';

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
            const responseMessage = await handleStoreCreationAction();
            return NextResponse.json({ response: responseMessage, isComplete: true });
        }
        
        return NextResponse.json({ response: aiResponseText, isComplete: false });

    } catch (error: any) {
        console.error('Error in chatbot API route:', error.response?.data || error.message);
        return NextResponse.json({ error: error.message || 'Failed to get response from chatbot AI' }, { status: 500 });
    }
}
