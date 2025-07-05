
'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminDb } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

// Helper to fetch the custom prompt from Firestore
async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un estratega senior de marketing digital. Tu tarea es analizar una URL y un objetivo de negocio para crear un plan de publicidad profesional.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto:**
- URL: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}
{{#if additional_context}}
- Información Adicional Clave del Negocio (proporcionada por el usuario):
{{{additional_context}}}
{{/if}}

**Instrucciones del Plan:**
1.  **executive_summary:** Resume la estrategia general en 2-3 párrafos. El resultado DEBE ser un único string de texto.
2.  **target_audience:** Describe al público objetivo detalladamente (demografía, intereses, puntos de dolor). El resultado DEBE ser un único string de texto, usando saltos de línea (\\n) para separar conceptos si es necesario.
3.  **strategies:** Propón estrategias para cada plataforma.
    -   "platform": Plataforma publicitaria (DEBE ser un solo string, ej. Google Ads, Meta Ads).
    -   "strategy_rationale": Justifica por qué esta plataforma es adecuada.
    -   "funnel_stage": Elige UNA de las siguientes opciones: 'Awareness', 'Consideration', 'Conversion'.
    -   "campaign_type": Elige el tipo de campaña MÁS RECOMENDADO (DEBE ser un solo string, ej. Performance Max, Búsqueda).
    -   "ad_formats": Lista de formatos de anuncio concretos a utilizar (ej. Video, Carrusel).
    -   "monthly_budget": número que representa la inversión en medios recomendada para esta plataforma.
    -   "targeting_suggestions": Array de 2-4 sugerencias de segmentación específicas para esta plataforma (ej. "Lookalike de clientes", "Intereses en jardinería", "Remarketing a visitantes de la web").
    -   "key_kpis": Array de 2-3 KPIs más importantes para ESTA ESTRATEGIA (ej. "ROAS > 4", "CPA < 20€").
    -   "creative_angle": El enfoque o mensaje principal para los anuncios de esta estrategia (ej. "Destacar la durabilidad y garantía del producto").
4.  **total_monthly_budget:** Suma de todos los presupuestos mensuales de las estrategias.
5.  **calendar:** Crea un plan detallado para 3 meses.
    - "month": Mes 1, 2, 3.
    - "focus": ej. Configuración y Lanzamiento.
    - "actions": Lista de acciones DETALLADAS y específicas a realizar durante ese mes. Las acciones deben estar directamente relacionadas con la URL y los objetivos. Sé explícito.
6.  **kpis:** Lista de KPIs clave GENERALES para toda la campaña, incluyendo un objetivo numérico cuantificable para cada uno (ej. "ROAS General > 3.5", "CPA Total < 25€", "CTR > 2%").
7.  **fee_proposal:** Propuesta de honorarios. Pon "setup_fee" y "management_fee" a 0. Genera una "fee_description" genérica sobre lo que suelen incluir los honorarios.
    - "setup_fee": 0.
    - "management_fee": 0.
    - "fee_description": Descripción genérica de los servicios.
`;
    if (!adminDb) return defaultPrompt;
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        return userSettingsDoc.data()?.prompts?.adPlan || defaultPrompt;
    } catch (error) {
        console.error("Error fetching 'adPlan' prompt, using default.", error);
        return defaultPrompt;
    }
}


export async function createAdPlan(input: CreateAdPlanInput, uid: string): Promise<CreateAdPlanOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

  const rawPrompt = await getAdPlanPrompt(uid);

  // Use Handlebars for robust templating
  const template = Handlebars.compile(rawPrompt, { noEscape: true });
  const prompt = template(input);
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsedJson = JSON.parse(responseText);

  // Add the original input URL and objectives to the final plan object
  const finalPlan = {
      ...parsedJson,
      url: input.url,
      objectives: input.objectives,
      additional_context: input.additional_context,
  };
  
  return CreateAdPlanOutputSchema.parse(finalPlan);
}
