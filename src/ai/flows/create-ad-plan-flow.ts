
'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// Helper to fetch the custom prompt from Firestore
async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un estratega senior de marketing digital. Tu tarea es analizar una URL y un objetivo de negocio para crear un plan de publicidad profesional.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto:**
- URL: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}

**Instrucciones del Plan:**
1.  **executive_summary:** Resume la estrategia general en 2-3 párrafos.
2.  **target_audience:** Describe al público objetivo detalladamente (demografía, intereses, puntos de dolor).
3.  **strategies:** Propón estrategias para cada plataforma.
    -   "platform": ej. Google Ads, Meta Ads.
    -   "strategy_rationale": Justifica por qué esta plataforma es adecuada.
    -   "funnel_stage": (Awareness, Consideration, Conversion).
    -   "campaign_type": ej. Performance Max, Búsqueda, Shopping.
    -   "ad_formats": ej. Video, Carrusel.
    -   "monthly_budget": número.
4.  **total_monthly_budget:** Suma de todos los presupuestos.
5.  **calendar:** Crea un plan para 3 meses.
    - "month": Mes 1, 2, 3.
    - "focus": ej. Configuración y Lanzamiento.
    - "actions": Lista de acciones concretas.
6.  **kpis:** Lista de KPIs clave (ej. ROAS, CPA, CTR).
7.  **fee_proposal:** Propuesta de honorarios.
    - "setup_fee": número.
    - "management_fee": número.
    - "fee_description": Qué incluyen los honorarios.
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
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  const rawPrompt = await getAdPlanPrompt(uid);

  // A simple Handlebars-like replacement
  const objectivesString = input.objectives.map(o => `- ${o}`).join('\n');
  const prompt = rawPrompt
    .replace(/{{url}}/g, input.url)
    .replace(/{{#each objectives}}.*{{this}}.*{{\/each}}/g, objectivesString);
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
  const parsedJson = JSON.parse(responseText);
  
  return CreateAdPlanOutputSchema.parse(parsedJson);
}
