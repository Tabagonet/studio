
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractDataFromConversation } from '@/ai/flows/chatbot-flow';
import { adminDb, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

interface Message {
    role: 'user' | 'model';
    content: string;
}

export async function POST(req: NextRequest) {
    try {
        const { messages }: { messages: Message[] } = await req.json();

        if (!Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid "messages" format. Expected an array.' }, { status: 400 });
        }
        
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
        return NextResponse.json({ error: 'Failed to get response from chatbot AI', message: error.message }, { status: 500 });
    }
}
