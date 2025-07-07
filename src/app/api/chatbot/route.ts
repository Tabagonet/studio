
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractDataFromConversation } from '@/ai/flows/chatbot-flow';
import { adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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
        console.warn("reCAPTCHA secret key not configured. Skipping verification.");
        // In a production environment, you might want to fail here if the key is missing.
        // For development, we allow it to proceed.
        return true;
    }

    // If the client explicitly signals that reCAPTCHA isn't ready, we can be lenient on the initial load.
    if (token === 'not-available') {
        console.warn("Client-side reCAPTCHA was not ready. Proceeding without verification for this request.");
        return true;
    }
    
    if (!token) {
        throw new Error("El token de reCAPTCHA es requerido.");
    }
    
    const verificationUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`;
    
    try {
        const response = await axios.post(verificationUrl);
        const { success, score } = response.data;
        if (!success || score < 0.5) {
            console.warn("reCAPTCHA verification failed:", response.data['error-codes']);
            throw new Error("Verificación de reCAPTCHA fallida. Por favor, inténtelo de nuevo.");
        }
        return true;
    } catch (error: any) {
        console.error("Error during reCAPTCHA verification request:", error.message);
        throw new Error("No se pudo verificar el reCAPTCHA. Inténtelo de nuevo más tarde.");
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
        
        // Verify reCAPTCHA token before proceeding
        await verifyRecaptcha(recaptchaToken);
        
        const aiResponseText = await getChatbotResponse(messages);
        
        if (aiResponseText.trim().toUpperCase() === 'FIN') {
            const inquiryData = await extractDataFromConversation(messages);
            
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
                        status: 'new',
                        source: 'chatbot',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Send notifications to super_admins
                    const superAdminsSnapshot = await adminDb.collection('users').where('role', '==', 'super_admin').get();
                    if (!superAdminsSnapshot.empty) {
                        const notificationBatch = adminDb.batch();
                        for (const adminDoc of superAdminsSnapshot.docs) {
                            const notificationRef = adminDb.collection('notifications').doc();
                            notificationBatch.set(notificationRef, {
                                recipientUid: adminDoc.id,
                                type: 'new_prospect',
                                title: 'Nuevo Prospecto Capturado',
                                message: `El lead "${inquiryData.name || inquiryData.email}" ha completado el cuestionario.`,
                                link: '/prospects',
                                read: false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                            });
                        }
                        await notificationBatch.commit();
                    }
                } catch (dbError) {
                     console.error("Failed to create prospect directly:", dbError);
                     // Don't fail the user response, just log the error.
                }
            } else {
                 console.error("adminDb is not available. Cannot save prospect.");
            }

            return NextResponse.json({ 
                response: '¡Genial! Hemos recibido toda la información. Uno de nuestros expertos la revisará y se pondrá en contacto contigo muy pronto. ¡Gracias!',
                isComplete: true 
            });
        }
        
        return NextResponse.json({ response: aiResponseText, isComplete: false });

    } catch (error: any) {
        console.error('Error in chatbot API route:', error);
        return NextResponse.json({ error: error.message || 'Failed to get response from chatbot AI' }, { status: 500 });
    }
}
