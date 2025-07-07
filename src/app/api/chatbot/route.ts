
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse, extractDataFromConversation } from '@/ai/flows/chatbot-flow';
import { adminDb } from '@/lib/firebase-admin';

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
            
            // Create the prospect in Firestore
             const createProspectResponse = await fetch(`${req.nextUrl.origin}/api/prospects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: inquiryData.name || 'No Proporcionado',
                    email: inquiryData.email || 'No Proporcionado',
                    companyUrl: inquiryData.companyUrl || 'No Proporcionado',
                    inquiryData: {
                        objective: inquiryData.objective,
                        businessDescription: inquiryData.businessDescription,
                        valueProposition: inquiryData.valueProposition,
                        targetAudience: inquiryData.targetAudience,
                        competitors: inquiryData.competitors,
                        brandPersonality: inquiryData.brandPersonality,
                        monthlyBudget: inquiryData.monthlyBudget,
                    },
                }),
            });
            
            if (!createProspectResponse.ok) {
                console.error("Failed to create prospect:", await createProspectResponse.text());
                // We don't throw here, just log. The user should still get a final message.
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
