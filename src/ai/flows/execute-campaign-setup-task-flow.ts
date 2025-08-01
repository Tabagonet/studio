

'use server';

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { type ExecuteTaskInput, CampaignSetupResultSchema, type CampaignSetupResult } from '@/app/(app)/ad-planner/schema';
import Handlebars from 'handlebars';

const CAMPAIGN_SETUP_PROMPT = `
Eres un especialista senior en Publicidad Digital. Tu tarea es proporcionar una guía de configuración clara y concisa para una campaña específica, basada en la tarea asignada.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto del Negocio y Estrategia:**
- URL del negocio: {{url}}
- Buyer Persona (Cliente Ideal): {{{buyerPersona}}}
- Propuesta de Valor: {{{valueProposition}}}
- Plataforma de Anuncios: {{strategyPlatform}}

**Tarea a Realizar:**
- **Tarea Específica:** "{{taskName}}"
- **Instrucción:** Basado en el contexto, genera una lista de 4-6 pasos clave para configurar esta campaña en "{{strategyPlatform}}". Para cada paso, proporciona un título ("step") y una descripción detallada ("details") de lo que se debe hacer. Las recomendaciones deben ser específicas y accionables para la plataforma y el tipo de campaña indicados.

**Ejemplo de Salida para una campaña "Performance Max":**
{
  "setupSteps": [
    {
      "step": "Configuración de Objetivos y Conversiones",
      "details": "Selecciona 'Ventas' como objetivo principal. Asegúrate de que las acciones de conversión clave (ej. 'purchase', 'add_to_cart') estén correctamente configuradas en Google Ads y que el seguimiento esté activo en la web."
    },
    {
      "step": "Creación de Grupos de Recursos (Asset Groups)",
      "details": "Crea al menos un grupo de recursos completo. Sube al menos 5 titulares, 3 descripciones largas, 5 imágenes de alta calidad en distintos formatos (cuadrado, horizontal) y 1 vídeo. Asegúrate de que los textos reflejen la propuesta de valor."
    }
  ]
}

**Formato de Salida JSON:**
Genera un objeto JSON con una clave "setupSteps". El valor debe ser un array de objetos, donde cada objeto representa un paso y tiene las siguientes claves:
- **"step"**: (string) El título del paso (ej. "Definir Objetivos y Conversiones").
- **"details"**: (string) Una descripción detallada de la acción a realizar en este paso, incluyendo recomendaciones específicas para la plataforma.

Genera la guía de configuración ahora.
`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function executeCampaignSetupTask(input: ExecuteTaskInput): Promise<CampaignSetupResult> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest", 
      generationConfig: { responseMimeType: "application/json" },
      safetySettings
  });

  const template = Handlebars.compile(CAMPAIGN_SETUP_PROMPT, { noEscape: true });
  const finalPrompt = template(input);
  
  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  let rawJson;
  try {
      rawJson = JSON.parse(response.text());
  } catch(e) {
      console.error("Error parsing JSON from campaign setup task:", e);
      throw new Error("La IA devolvió una respuesta JSON inválida para la guía de configuración.");
  }
  
  return CampaignSetupResultSchema.parse(rawJson);
}
