
/**
 * @fileOverview An ad creatives generation AI agent.
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import Handlebars from 'handlebars';
import { 
  GenerateAdCreativesInputSchema,
  type GenerateAdCreativesInput,
  GenerateAdCreativesOutputSchema,
  type GenerateAdCreativesOutput,
} from '@/app/(app)/ad-planner/schema';

const CREATIVES_PROMPT = `Eres un director creativo y copywriter senior en una agencia de marketing digital. Tu tarea es generar creativos publicitarios impactantes basados en una estrategia definida.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto Estratégico:**
- Plataforma: {{platform}}
- Tipo de Campaña: {{campaign_type}}
- Fase del Embudo: {{funnel_stage}}
- URL del Cliente: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}
- Público Objetivo: {{target_audience}}

**Instrucciones Creativas:**
Basado en el contexto, genera los siguientes recursos para la campaña:
1.  **"headlines"**: Crea una lista de 3 a 5 titulares cortos y potentes, optimizados para "{{platform}}". Deben captar la atención inmediatamente. Máximo 30-40 caracteres cada uno.
2.  **"descriptions"**: Crea una lista de 2 a 3 descripciones persuasivas para el cuerpo del anuncio. Deben complementar los titulares y expandir el mensaje. Máximo 90 caracteres cada una.
3.  **"cta_suggestions"**: Propón una lista de 2 a 3 llamadas a la acción (Call to Action) claras y directas.
4.  **"visual_ideas"**: Describe una lista de 2 a 3 conceptos visuales para la imagen o el vídeo del anuncio. Piensa en el estilo, los elementos a mostrar y la emoción a transmitir.

Genera la respuesta en formato JSON.`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function generateAdCreatives(input: GenerateAdCreativesInput): Promise<GenerateAdCreativesOutput> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest", 
        generationConfig: { responseMimeType: "application/json" },
        safetySettings
    });

    const template = Handlebars.compile(CREATIVES_PROMPT, { noEscape: true });
    const finalPrompt = template(input);
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    let rawJson;
    try {
        rawJson = JSON.parse(response.text());
    } catch(e) {
        throw new Error("La IA devolvió una respuesta JSON inválida.");
    }

    return GenerateAdCreativesOutputSchema.parse(rawJson);
}
