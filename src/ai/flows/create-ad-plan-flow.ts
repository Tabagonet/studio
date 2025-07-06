
'use server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminDb } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

// Helper to fetch the custom prompt from Firestore
async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un experto de talla mundial en marketing digital, producto digital y posicionamiento de marca. Tienes acceso a una base de datos con múltiples estrategias probadas para distintos sectores (moda, tecnología, ecommerce, salud, educación, consultoría, logística, restauración, etc.) y debes generar una estrategia personalizada y ganadora.
Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios ni markdown.

**INFORMACIÓN DE ENTRADA:**
- URL del negocio: {{url}}
- Objetivos de la campaña: {{#each objectives}}- {{this}}{{/each}}
{{#if additional_context}}
- Contexto Adicional Clave (prioridad máxima):
{{{additional_context}}}
{{/if}}

**PROCESO DE GENERACIÓN JSON (Sigue estos pasos y estructura):**
Genera un objeto JSON con las siguientes claves principales:

1.  **"buyer_persona"**: (string) Describe el perfil psicográfico del cliente ideal en un párrafo detallado. Incluye edad, género, ubicación, intereses, y puntos de dolor.
2.  **"value_proposition"**: (string) Define la propuesta de valor clara y diferencial del negocio en una o dos frases. ¿Qué lo hace único?
3.  **"funnel"**: (array de objetos) Describe el embudo de conversión completo en 5 etapas (Awareness, Consideration, Conversion, Retention, Referral). Para cada etapa, crea un objeto con:
    -   "stage_name": (string) ej. "Awareness (Notoriedad)".
    -   "description": (string) Breve descripción del objetivo de esta fase.
    -   "channels": (array of strings) Canales recomendados para esta fase (ej. "Meta Ads", "SEO").
    -   "content_types": (array of strings) Tipos de contenido para esos canales (ej. "Reels inspiradores", "Artículos de blog 'Cómo...'").
    -   "kpis": (array of strings) KPIs clave para medir el éxito en esta fase (ej. "Alcance", "Impresiones").
4.  **"strategies"**: (array de objetos) Esta es la sección del **plan de medios interactivo**. Propón 2-4 estrategias, una por plataforma principal. Cada objeto debe tener:
    -   "platform": (string) El nombre de la plataforma (ej. "Google Ads").
    -   "strategy_rationale": (string) Justificación de por qué esta plataforma es adecuada.
    -   "funnel_stage": (string, enum: "Awareness", "Consideration", "Conversion") La fase principal del embudo a la que apunta esta estrategia.
    -   "campaign_type": (string) El tipo de campaña recomendado (ej. "Performance Max", "Tráfico a la web").
    -   "ad_formats": (array of strings) Formatos de anuncio sugeridos (ej. "Anuncios de Búsqueda", "Video Ads").
    -   "monthly_budget": (number) Presupuesto mensual estimado para ESTA plataforma.
    -   "targeting_suggestions": (array of strings) 2-3 ideas concretas de segmentación (ej. "Públicos afines: 'amantes de la moda'", "Remarketing a visitantes").
    -   "key_kpis": (array of strings) 2 KPIs clave para esta estrategia (ej. "ROAS", "Coste por Lead").
    -   "creative_angle": (string) El enfoque creativo principal (ej. "Énfasis en la calidad y el confort", "Ofertas y descuentos").
5.  **"total_monthly_budget"**: (number) La suma total de los \`monthly_budget\` de todas las estrategias.
6.  **"recommended_tools"**: (array of strings) 3-5 herramientas recomendadas para ejecutar la estrategia (ej. "Semrush para SEO", "Mailchimp para email", "Meta Business Suite").
7.  **"calendar"**: (array de objetos) Un calendario para los primeros 3 meses. Cada objeto tiene:
    -   "month": (string) ej. "Mes 1".
    -   "focus": (string) El enfoque principal para ese mes.
    -   "actions": (array of strings) 3-5 acciones concretas para ese mes.
8.  **"extra_recommendations"**: (array of strings) 2-4 recomendaciones extra sobre posicionamiento, tono, storytelling, o experiencia de usuario.
9.  **"fee_proposal"**: (object) Una propuesta de honorarios de agencia estándar.
    -   "setup_fee": (number) Un coste de configuración inicial (ej. 1500).
    -   "management_fee": (number) Una cuota de gestión mensual (ej. 2500).
    -   "fee_description": (string) Explica qué incluyen los honorarios (ej. "Setup y gestión de campañas, reporting mensual, optimización continua.").

Ahora, genera el plan estratégico completo en formato JSON.`;
    if (!adminDb) return defaultPrompt;
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        // Fallback to the new prompt if the old one 'adPlan' is fetched.
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

  // Data cleaning step to coerce budget numbers from string to number if needed.
  if (parsedJson.total_monthly_budget && typeof parsedJson.total_monthly_budget === 'string') {
    parsedJson.total_monthly_budget = parseFloat(parsedJson.total_monthly_budget);
  }
  if (parsedJson.fee_proposal) {
    if (typeof parsedJson.fee_proposal.setup_fee === 'string') {
        parsedJson.fee_proposal.setup_fee = parseFloat(parsedJson.fee_proposal.setup_fee);
    }
    if (typeof parsedJson.fee_proposal.management_fee === 'string') {
        parsedJson.fee_proposal.management_fee = parseFloat(parsedJson.fee_proposal.management_fee);
    }
  }
  if (parsedJson.strategies && Array.isArray(parsedJson.strategies)) {
      parsedJson.strategies.forEach((strategy: any) => {
          if (strategy.monthly_budget && typeof strategy.monthly_budget === 'string') {
              strategy.monthly_budget = parseFloat(strategy.monthly_budget);
          }
      });
  }

  // Add the original input URL and objectives to the final plan object
  const finalPlan = {
      ...parsedJson,
      url: input.url,
      objectives: input.objectives,
      additional_context: input.additional_context,
  };
  
  return CreateAdPlanOutputSchema.parse(finalPlan);
}
