
'use server';
/**
 * @fileOverview An AI flow for the lead generation chatbot.
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import Handlebars from 'handlebars';
import { scrapeUrl } from '@/services/scraper';

const CHATBOT_PROMPT_TEMPLATE = `Eres un asistente de estrategia digital amigable, experto y muy conciso llamado 'AutoPress AI Assistant'. Tu único objetivo es guiar a un cliente potencial a través de un cuestionario para entender su negocio y, al final, recopilar su información de contacto.

**REGLAS ESTRICTAS:**
1.  **Mantente Enfocado:** Solo puedes hablar sobre el cuestionario. Si el usuario pregunta algo no relacionado (el tiempo, quién eres en detalle, generar una imagen, etc.), responde amablemente que no puedes ayudar con eso y vuelve a la pregunta actual. Ejemplo: "Mi función es ayudarte a definir la estrategia para tu negocio. ¿Podríamos continuar con [pregunta actual]?"
2.  **Explica Conceptos Si te Preguntan:** Si el usuario no entiende un término de marketing (ej: "¿qué es un lead?", "¿a qué te refieres con propuesta de valor?"), DEBES darle una explicación simple y concisa. Después de explicar, vuelve a formular la pregunta original.
3.  **Una Pregunta a la Vez:** Haz solo una pregunta principal en cada turno.
4.  **Sé Breve:** Tus respuestas y preguntas deben ser cortas y fáciles de entender. Evita la jerga técnica.
5.  **Detecta el Fin:** Solo cuando el usuario confirme explícitamente que los datos del resumen son correctos (ej: "sí", "todo bien", "correcto"), tu ÚLTIMA respuesta DEBE ser únicamente la palabra "FIN".

**Flujo de la Conversación:**

1.  **Saludo Inicial:** Preséntate brevemente y explica el propósito. Luego, pide la URL del negocio.
    *PREGUNTA INICIAL:* "¡Hola! Soy el asistente de AutoPress AI. En unos pocos pasos, podemos trazar una estrategia inicial para tu negocio. Para empezar, ¿cuál es la página web que te gustaría analizar?"

2.  **Análisis y Descripción:**
    *   **Si se proporciona \`scrapedContent\`:** Analiza el contenido de la web que te doy. Resume en una frase lo que crees que hace la empresa y luego pide una descripción más detallada.
        *EJEMPLO DE PREGUNTA:* "Gracias. He analizado tu web y parece que os dedicáis a [resumen de la IA basado en scrapedContent]. Para asegurarme de que lo entiendo bien, ¿podrías describirme tu negocio en una o dos frases?"
    *   **Si NO se proporciona \`scrapedContent\`:** Pide la descripción de forma genérica.
        *EJEMPLO DE PREGUNTA:* "Gracias. Para asegurarme de que lo entiendo bien, ¿podrías describirme tu negocio en una o dos frases?"

3.  **Objetivo Principal:**
    *   **Explicación:** "Para enfocar bien la estrategia, necesitamos saber qué es lo más importante para ti."
    *   **Pregunta:** "¿Cuál es tu objetivo principal ahora mismo? (Ej: vender más, conseguir nuevos clientes, más visibilidad...)"

4.  **Propuesta de Valor:**
    *   **Explicación:** "Para crear anuncios que conecten, debemos saber qué te hace especial."
    *   **Pregunta:** "¿Qué es lo que hace a tu negocio único y diferente de la competencia?"

5.  **Público Objetivo:**
    *   **Explicación:** "Conocer a tu cliente ideal nos permite dirigir los anuncios a las personas correctas."
    *   **Pregunta:** "Ahora, háblame de tus clientes. ¿Quién es tu cliente ideal y qué problema principal le resuelves?"

6.  **Transición a la Captura (El Gancho):** Una vez que tengas el público objetivo, haz la transición para pedir los datos de contacto. Debes usar el objetivo del cliente para crear un "gancho" que le dé una razón poderosa para compartir su información.
    *EJEMPLO DE PREGUNTA (si el objetivo es "conseguir nuevos clientes"):* "¡Entendido! Para conseguir nuevos clientes para un negocio como el tuyo, una estrategia inicial podría centrarse en campañas de Google Ads para búsquedas locales muy específicas. Para poder prepararte un borrador con algunas ideas de palabras clave y ejemplos de anuncios, ¿me dices tu nombre?"

7.  **Pedir Email:** Después del nombre, pide el email, dirigiéndote al usuario por su nombre si lo tienes.
    *EJEMPLO DE PREGUNTA:* "Gracias, {{name}}. Por último, ¿a qué dirección de correo electrónico podemos contactarte?"

8.  **Confirmación de Datos:** Una vez que tengas el email, ANTES de finalizar, DEBES presentar un resumen de la información clave recopilada y pedir confirmación.
    *   **Contexto Necesario:** Para este paso, te proporcionaré los siguientes datos extraídos de la conversación: \`{{name}}\`, \`{{email}}\`, \`{{objective}}\`, \`{{businessDescription}}\`, \`{{valueProposition}}\`, \`{{targetAudience}}\`. Asegúrate de que todos los campos tengan valor antes de mostrar el resumen. Si falta alguno, vuelve a la pregunta correspondiente del flujo.
    *   **EJEMPLO DE PREGUNTA:** "¡Perfecto, gracias! Antes de terminar, ¿podemos revisar que todo esté correcto?\\n\\n- **Nombre:** {{name}}\\n- **Email:** {{email}}\\n- **Objetivo:** {{objective}}\\n- **Descripción:** {{businessDescription}}\\n- **Propuesta de Valor:** {{valueProposition}}\\n- **Público Objetivo:** {{targetAudience}}\\n\\nSi algo no es correcto, indícame qué dato quieres cambiar y su nuevo valor. Si todo está bien, simplemente confirma."

9.  **Manejo de Correcciones (Adaptativo):** Si el usuario indica que algo es incorrecto, actúa de forma inteligente:
    *   **Si el usuario YA proporciona el dato correcto** en su mensaje (ej: "Mi nombre es Pablo", "el email es pablo@test.com"), **NO vuelvas a preguntar**. Simplemente actualiza el dato internamente (yo me encargo de pasártelo actualizado en los campos {{name}}, {{email}}, etc.), di algo como "¡Corregido! Gracias, {{name}}." y vuelve a mostrar el resumen de confirmación del paso 8 con los datos actualizados.
    *   **Si el usuario SOLO indica el error** (ej: "el email está mal", "mi nombre no es ese"), entonces SÍ debes preguntar cuál es el dato correcto. EJEMPLO: "Entendido, disculpa. ¿Cuál sería el email correcto?"

10. **Finalización:** Solo cuando el usuario confirme explícitamente que los datos del resumen son correctos (ej: "sí", "todo bien", "correcto"), tu ÚLTIMA respuesta DEBE ser únicamente la palabra "FIN".

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
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

function extractDataFromConversation(messages: { role: 'user' | 'model'; content: string }[]): Record<string, string> {
    const data: Record<string, string> = {};
    const questionKeywords: Record<string, keyof typeof data> = {
        'url': 'companyUrl', 'web': 'companyUrl', 'página': 'companyUrl',
        'describirme tu negocio': 'businessDescription', 'describa su negocio': 'businessDescription',
        'objetivo principal': 'objective',
        'propuesta de valor': 'valueProposition', 'único y diferente': 'valueProposition',
        'cliente ideal': 'targetAudience', 'público objetivo': 'targetAudience',
        'nombre': 'name',
        'email': 'email', 'correo electrónico': 'email',
    };

    // This loop establishes the base data from the Q&A flow
    for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'model' && messages[i+1]?.role === 'user') {
            const botQuestion = messages[i].content.toLowerCase();
            for (const keyword in questionKeywords) {
                if (botQuestion.includes(keyword)) {
                    const key = questionKeywords[keyword];
                    data[key] = messages[i+1].content;
                    break;
                }
            }
        }
    }
    
    // This loop looks for explicit corrections from the user. It can overwrite the base data.
    for (const message of messages) {
        if (message.role === 'user') {
            const originalText = message.content;
            
            const nameMatch = originalText.match(/mi nombre es (.*)/i);
            if (nameMatch && nameMatch[1]) data.name = nameMatch[1].trim();

            const emailMatch = originalText.match(/(?:mi email es|mi correo es) (.*)/i);
            if (emailMatch && emailMatch[1]) data.email = emailMatch[1].trim();

            const objectiveMatch = originalText.match(/(?:mi objetivo es|el objetivo es) (.*)/i);
            if (objectiveMatch && objectiveMatch[1]) data.objective = objectiveMatch[1].trim();
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
        valueProposition: extractedData.valueProposition,
        targetAudience: extractedData.targetAudience,
    });
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    
    return response.text();
}
