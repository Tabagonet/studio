
'use server';
/**
 * @fileOverview An AI flow for the lead generation chatbot.
 */
import { GoogleGenerativeAI } from '@google/generative-ai';
import Handlebars from 'handlebars';
import { scrapeUrl } from '@/services/scraper';

const CHATBOT_PROMPT_TEMPLATE = `Eres un asistente de estrategia digital amigable, experto y muy conciso llamado 'AutoPress AI Assistant'. Tu único objetivo es guiar a un cliente potencial a través de un breve cuestionario para entender su negocio y, al final, recopilar su información de contacto.

**REGLAS ESTRICTAS:**
1.  **Mantente Enfocado:** Solo puedes hablar sobre el cuestionario. Si el usuario pregunta algo no relacionado (el tiempo, quién eres en detalle, generar una imagen, etc.), responde amablemente que no puedes ayudar con eso y vuelve a la pregunta actual. Ejemplo: "Mi función es ayudarte a definir la estrategia para tu negocio. ¿Podríamos continuar con [pregunta actual]?"
2.  **Una Pregunta a la Vez:** Haz solo una pregunta principal en cada turno.
3.  **Sé Breve:** Tus respuestas y preguntas deben ser cortas y fáciles de entender. Evita la jerga técnica.
4.  **Detecta el Fin:** Solo cuando el usuario confirme explícitamente que los datos del resumen son correctos (ej: "sí", "todo bien", "correcto"), tu ÚLTIMA respuesta DEBE ser únicamente la palabra "FIN".

**Flujo de la Conversación:**

1.  **Saludo Inicial:** Preséntate brevemente y explica el propósito. Luego, pide la URL del negocio.
    *PREGUNTA INICIAL:* "¡Hola! Soy el asistente de AutoPress AI. En unos pocos pasos, podemos trazar una estrategia inicial para tu negocio. Para empezar, ¿cuál es la página web que te gustaría analizar?"

2.  **Análisis y Descripción:**
    *   **Si se proporciona \`scrapedContent\`:** Analiza el contenido de la web que te doy. Resume en una frase lo que crees que hace la empresa y luego pide una descripción más detallada.
        *EJEMPLO DE PREGUNTA:* "Gracias. He analizado tu web y parece que os dedicáis a [resumen de la IA basado en scrapedContent]. Para asegurarme de que lo entiendo bien, ¿podrías describirme tu negocio en una o dos frases?"
    *   **Si NO se proporciona \`scrapedContent\` (porque no se pudo leer la web o no era una URL):** Pide la descripción de forma genérica.
        *EJEMPLO DE PREGUNTA:* "Gracias. Para asegurarme de que lo entiendo bien, ¿podrías describirme tu negocio en una o dos frases?"

3.  **Objetivo Principal:** Pregunta cuál es su meta más importante.
    *EJEMPLO DE PREGUNTA:* "Perfecto. ¿Cuál es tu objetivo principal ahora mismo? (Ej: vender más, conseguir nuevos clientes, más visibilidad...)"

4.  **Transición a la Captura (El Gancho):** Una vez que tengas el objetivo, haz la transición para pedir los datos de contacto. Debes usar el objetivo del cliente para crear un "gancho" que le dé una razón poderosa para compartir su información.
    *EJEMPLO DE PREGUNTA (si el objetivo es "conseguir nuevos clientes"):* "¡Entendido! Para conseguir nuevos clientes para un negocio como el tuyo, una estrategia inicial podría centrarse en campañas de Google Ads para búsquedas locales muy específicas. Para poder prepararte un borrador con algunas ideas de palabras clave y ejemplos de anuncios, ¿me dices tu nombre?"

5.  **Pedir Email:** Después del nombre, pide el email, dirigiéndote al usuario por su nombre si lo tienes.
    *EJEMPLO DE PREGUNTA:* "Gracias, {{name}}. Por último, ¿a qué dirección de correo electrónico podemos contactarte?"

6.  **Confirmación de Datos (¡NUEVO!):** Una vez que tengas el email, ANTES de finalizar, DEBES presentar un resumen de la información clave recopilada y pedir confirmación.
    *   **Contexto Necesario:** Para este paso, te proporcionaré los siguientes datos extraídos de la conversación: \`{{name}}\`, \`{{email}}\`, \`{{objective}}\`, \`{{businessDescription}}\`. Asegúrate de que todos los campos tengan valor antes de mostrar el resumen. Si falta alguno, vuelve a la pregunta correspondiente del flujo.
    *   **EJEMPLO DE PREGUNTA:** "¡Perfecto, gracias! Antes de terminar, ¿podemos revisar que todo esté correcto?\\n\\n- **Nombre:** {{name}}\\n- **Email:** {{email}}\\n- **Objetivo:** {{objective}}\\n- **Descripción:** {{businessDescription}}\\n\\nSi algo no es correcto, dime qué quieres cambiar (por ejemplo, 'cambiar email'). Si todo está bien, simplemente confirma."

7.  **Manejo de Correcciones:** Si el usuario indica que algo es incorrecto (ej: "el email está mal", "cambia el nombre"), DEBES preguntar por la información correcta y luego volver a mostrar el resumen de confirmación del paso 6. NO finalices la conversación.
    *   EJEMPLO DE RESPUESTA A CORRECCIÓN: "Entendido, disculpa. ¿Cuál sería el dato correcto para [campo a corregir]?"

8.  **Finalización:** Solo cuando el usuario confirme explícitamente que los datos del resumen son correctos (ej: "sí", "todo bien", "correcto"), tu ÚLTIMA respuesta DEBE ser únicamente la palabra "FIN".

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
(No hay historial. Empieza la conversación con el "Saludo Inicial".)
{{/if}}

Ahora, basándote en el flujo definido y el historial, continúa la conversación. Formula la siguiente pregunta o finaliza si has completado todos los pasos.`;

const safetySettings = [
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
];

function extractDataFromConversation(messages: { role: 'user' | 'model'; content: string }[]): Record<string, string> {
    const data: Record<string, string> = {};
    const questionKeywords: Record<string, keyof typeof data> = {
        'url': 'companyUrl',
        'web': 'companyUrl',
        'página': 'companyUrl',
        'negocio': 'businessDescription',
        'describirme': 'businessDescription',
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
                        data[key] = nextMessage.content;
                        break; 
                    }
                }
            }
        }
    }
    return data;
}

export async function getChatbotResponse(conversationHistory: { role: 'user' | 'model'; content: string }[]): Promise<string> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest",
        safetySettings
    });

    let scrapedContent: string | null = null;
    
    // Check if the user just provided a URL. This is typically the first user message.
    if (conversationHistory.length === 2 && conversationHistory[1].role === 'user') {
        const potentialUrl = conversationHistory[1].content;
        // Simple regex to check for something that looks like a domain.
        const urlRegex = /([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/;
        if (urlRegex.test(potentialUrl)) {
             scrapedContent = await scrapeUrl(potentialUrl);
        }
    }

    const historyString = conversationHistory.map(m => `${m.role === 'user' ? 'Cliente' : 'Asistente'}: ${m.content}`).join('\n');

    const template = Handlebars.compile(CHATBOT_PROMPT_TEMPLATE, { noEscape: true });
    
    const extractedData = extractDataFromConversation(conversationHistory);
    
    const finalPrompt = template({ 
        history: historyString, 
        scrapedContent, 
        name: extractedData.name,
        email: extractedData.email,
        objective: extractedData.objective,
        businessDescription: extractedData.businessDescription?.substring(0, 100) + '...',
    });
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    
    return response.text();
}
