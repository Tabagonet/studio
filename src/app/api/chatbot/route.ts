
import { NextRequest, NextResponse } from 'next/server';
import { getChatbotResponse } from '@/ai/flows/chatbot-flow';
import { adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

interface Message {
    role: 'user' | 'model';
    content: string;
}

// Helper to extract collected data from conversation history
function extractDataFromConversation(messages: Message[]): Record<string, string> {
    const data: Record<string, string> = {};
    const questionKeywords: Record<string, keyof typeof data> = {
        'url': 'companyUrl',
        'web': 'companyUrl',
        'página': 'companyUrl',
        'negocio': 'businessDescription',
        'describir': 'businessDescription',
        'objetivo': 'objective',
        'meta': 'objective',
        'nombre': 'name',
        'llamas': 'name',
        'email': 'email',
        'correo': 'email',
    };

    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'model') {
            const botQuestion = messages[i].content.toLowerCase();
            const nextMessage = messages[i + 1];

            if (nextMessage && nextMessage.role === 'user') {
                for (const keyword in questionKeywords) {
                    if (botQuestion.includes(keyword)) {
                        const key = questionKeywords[keyword];
                        // Assign the user's answer to the corresponding key.
                        // This will overwrite previous assignments if the bot asks a similar question,
                        // which is fine as we only care about the last given answer for each piece of data.
                        data[key] = nextMessage.content;
                        break; 
                    }
                }
            }
        }
    }
    return data;
}

export async function POST(req: NextRequest) {
    try {
        const { messages }: { messages: Message[] } = await req.json();

        if (!Array.isArray(messages)) {
            return NextResponse.json({ error: 'Invalid "messages" format. Expected an array.' }, { status: 400 });
        }
        
        const aiResponseText = await getChatbotResponse(messages);
        
        if (aiResponseText.trim().toUpperCase() === 'FIN') {
            const inquiryData = extractDataFromConversation(messages);
            
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
