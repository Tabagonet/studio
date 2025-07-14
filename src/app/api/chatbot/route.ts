import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractStoreCreationData } from '@/ai/flows/chatbot-flow';
import { handleStoreCreationAction } from './actions';
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
        // This is a controlled case for when the frontend isn't ready.
        // It's better to ask the user to retry than to fail silently.
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
        // Re-throw specific user-facing errors, or a generic one for network issues.
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
        // Log the full error to the server console for debugging
        console.error('Error in /api/chatbot POST handler:', error);
        
        // Send a user-friendly and specific error message back to the client
        return NextResponse.json({ error: error.message || 'Failed to get response from chatbot AI' }, { status: 500 });
    }
}
