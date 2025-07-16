
/**
 * @fileOverview An AI flow for the lead generation chatbot.
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import Handlebars from 'handlebars';
import { scrapeUrl } from '@/services/scraper';
import { adminDb } from '@/lib/firebase-admin';

const CHATBOT_PROMPT_TEMPLATE = `Eres un asistente de estrategia digital amigable, experto y muy conciso llamado 'AutoPress AI Assistant'. Tu objetivo es guiar a un cliente potencial a través de un cuestionario para realizar un análisis estratégico de su negocio.

**REGLAS ESTRICTAS:**
1.  **Mantente Enfocado:** Solo puedes hablar sobre el cuestionario de análisis. Si el usuario pregunta algo no relacionado, responde amablemente que no puedes ayudar con eso y vuelve a la pregunta actual.
2.  **Explica Conceptos:** Si el usuario no entiende un término, DEBES darle una explicación simple y concisa.
3.  **Una Pregunta a la Vez:** Haz solo una pregunta principal en cada turno.
4.  **Sé Breve:** Tus respuestas y preguntas deben ser cortas y fáciles de entender.

**Flujo de la Conversación (Análisis Estratégico):**

1.  **Saludo y Petición de URL:** Preséntate y pide la URL del negocio del usuario para empezar el análisis.
    *PREGUNTA INICIAL:* "¡Hola! Soy el asistente de AutoPress AI. Para poder realizar un análisis estratégico de tu negocio, ¿podrías facilitarme la URL de tu página web?"

2.  **Análisis de Contenido y Cuestionario:**
    *   Si el usuario proporciona una URL, analízala para obtener contexto.
    *   Guíalo a través de las preguntas del flujo de análisis: descripción del negocio, competidores, objetivo principal, propuesta de valor, público, personalidad y presupuesto.
    *   Al final, pide el nombre y el email para el contacto.
    *   Presenta el resumen para confirmación.
    *   **IMPORTANTE:** Solo cuando el usuario confirme el resumen, tu ÚLTIMA respuesta DEBE ser únicamente la palabra "FIN-ANALISIS". No añadas nada más.

**Contexto de Conversación Anterior:**
{{#if existingProspectData}}
---
Hemos encontrado estos datos para esta URL:
- Objetivo: {{existingProspectData.objective}}
- Descripción: {{existingProspectData.businessDescription}}
---
**INSTRUCCIÓN CONTEXTUAL:** Ya que tienes información, saluda y confirma los datos. Si todo está bien, pasa a pedir los datos de contacto (nombre y email). Si no, procede con las preguntas normales del flujo de análisis.
{{/if}}

{{#if scrapedContent}}
**Contenido Analizado de la Web:**
---
{{{scrapedContent}}}
---
{{/if}}

**Historial de la Conversación Actual:**
{{#if history}}
{{{history}}}
{{else}}
(No hay historial. Empieza la conversación con el "Saludo y Petición de URL".)
{{/if}}

Ahora, basándote en el flujo definido y el historial, continúa la conversación. Formula la siguiente pregunta o finaliza si has completado todos los pasos.
`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

interface Message {
  role: 'user' | 'model';
  content: string;
}

const findUrlInMessages = (messages: Message[]): string | null => {
    const urlRegex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s]*)?)/i;
    for (const message of messages) {
        if (message.role === 'user') {
            const match = message.content.match(urlRegex);
            if (match) return match[0];
        }
    }
    return null;
}

// Function to call the Gemini API
export async function getChatbotResponse(messages: Message[]): Promise<string> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        safetySettings
    });

    let scrapedContent: string | null = null;
    let existingProspectData: any = null;
    
    // Filter to get only user messages
    const userMessages = messages.filter(msg => msg.role === 'user');

    // Only scrape and check DB on the very first message from the user
    if (userMessages.length === 1) {
        const url = findUrlInMessages(messages);
        if (url) {
            scrapedContent = await scrapeUrl(url);
            
            if (adminDb) {
                try {
                    const prospectsRef = adminDb.collection('prospects');
                    const snapshot = await prospectsRef.where('companyUrl', '==', url).limit(1).get();
                    if (!snapshot.empty) {
                        existingProspectData = snapshot.docs[0].data().inquiryData || null;
                    }
                } catch (dbError) {
                    console.error("Error fetching existing prospect data:", dbError);
                    existingProspectData = null;
                }
            }
        }
    }
    
    // The history needs to be formatted for the prompt
    const history = messages
        .map(msg => `${msg.role === 'user' ? 'Usuario' : 'Asistente'}: ${msg.content}`)
        .join('\n');
            
    const template = Handlebars.compile(CHATBOT_PROMPT_TEMPLATE, { noEscape: true });
    const finalPrompt = template({ 
        history, 
        scrapedContent,
        existingProspectData,
    });
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    return response.text();
}

// Helper to extract data from the conversation history
const extractData = (conversationText: string, regex: RegExp): string => {
    const matches = [...conversationText.matchAll(regex)];
    // Return the last captured group, or an empty string.
    if (matches.length > 0) {
        return (matches[matches.length - 1][1] || '').trim();
    }
    return '';
};


// Helper to extract analysis data from conversation
export async function extractAnalysisData(messages: Message[]) {
    const conversationText = messages.map(m => m.content).join('\n\n');
    return {
        name: extractData(conversationText, /- \*\*Nombre:\*\*\s*(.*?)\n/g),
        email: extractData(conversationText, /- \*\*Email:\*\*\s*(.*?)\n/g),
        objective: extractData(conversationText, /- \*\*Objetivo:\*\*\s*(.*?)\n/g),
        businessDescription: extractData(conversationText, /- \*\*Descripción:\*\*\s*(.*?)\n/g),
        valueProposition: extractData(conversationText, /- \*\*Propuesta de Valor:\*\*\s*(.*?)\n/g),
        targetAudience: extractData(conversationText, /- \*\*Público Objetivo:\*\*\s*(.*?)\n/g),
        competitors: extractData(conversationText, /- \*\*Competidores:\*\*\s*(.*?)\n/g),
        brandPersonality: extractData(conversationText, /- \*\*Personalidad de Marca:\*\*\s*(.*?)\n/g),
        monthlyBudget: extractData(conversationText, /- \*\*Presupuesto Mensual:\*\*\s*(.*?)\n/g),
        companyUrl: findUrlInMessages(messages),
    };
}
