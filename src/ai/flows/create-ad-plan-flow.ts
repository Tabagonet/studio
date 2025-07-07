

'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { type CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminDb } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un estratega de marketing digital de clase mundial. Tu tarea es generar una estrategia publicitaria completa, profesional y personalizada.
Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios ni markdown.

**INFORMACIÓN PROPORCIONADA (debes usar esta información como la fuente principal de verdad):**
- URL del negocio: {{url}}
- Objetivos Generales de la Campaña: {{#each objectives}}- {{this}}{{/each}}

{{#if companyInfo}}
- **Información de la Empresa (Misión, Visión, etc.):** {{{companyInfo}}}
{{/if}}
{{#if valueProposition}}
- **Propuesta de Valor y Diferenciación:** {{{valueProposition}}}
{{/if}}
{{#if targetAudience}}
- **Público Objetivo y sus Problemas:** {{{targetAudience}}}
{{/if}}
{{#if competitors}}
- **Competencia y Mercado:** {{{competitors}}}
{{/if}}
{{#if priorityObjective}}
- **Objetivo Principal Prioritario (MÁXIMA PRIORIDAD):** {{{priorityObjective}}}
{{/if}}
{{#if monthlyBudget}}
- **Presupuesto Máximo Indicado:** {{{monthlyBudget}}}
{{/if}}
{{#if brandPersonality.length}}
- **Personalidad de Marca Clave (Adjetivos):** {{#each brandPersonality}}{{#if @index}}, {{/if}}{{this}}{{/each}}
{{/if}}
{{#if additionalContext}}
- **Contexto Adicional General (Notas Finales):** {{{additionalContext}}}
{{/if}}

**PROCESO DE GENERACIÓN JSON (Sigue estos pasos y estructura):**
Genera un objeto JSON con las siguientes claves principales:

1.  **"buyer_persona"**: (string) Describe el perfil psicográfico del cliente ideal en un párrafo detallado. Sintetiza la información de "Público Objetivo".
2.  **"value_proposition"**: (string) Define la propuesta de valor clara y diferencial del negocio en una o dos frases. Sintetiza la información de "Propuesta de Valor".
3.  **"funnel"**: (array de objetos) Describe el embudo de conversión completo en 5 etapas (Awareness, Consideration, Conversion, Retention, Referral). **Orienta las descripciones y KPIs de cada fase para apoyar el "Objetivo Principal Prioritario"**. Para cada etapa, crea un objeto con:
    -   "stage_name": (string) ej. "Awareness (Notoriedad)".
    -   "description": (string) Breve descripción del objetivo de esta fase.
    -   "channels": (array of strings) Canales recomendados (ej. "Meta Ads", "SEO").
    -   "content_types": (array of strings) Tipos de contenido para esos canales (ej. "Reels inspiradores", "Artículos de blog 'Cómo...'").
    -   "kpis": (array of strings) KPIs clave con objetivos numéricos para medir el éxito (ej. "Alcance > 100.000", "Impresiones > 500.000", "CTR > 2%", "CPC < 0.50€").
4.  **"strategies"**: (array de objetos) El plan de medios interactivo. Propón 2-4 estrategias. **Asegúrate de que estas estrategias estén DIRECTAMENTE enfocadas en conseguir el "Objetivo Principal Prioritario". El "Ángulo Creativo" debe reflejar la "Personalidad de Marca" indicada.** Cada objeto debe tener:
    -   "platform": (string) El nombre de la plataforma (ej. "Google Ads").
    -   "strategy_rationale": (string) Justificación de por qué esta plataforma es adecuada.
    -   "funnel_stage": (string, enum: "Awareness", "Consideration", "Conversion") La fase principal del embudo.
    -   "campaign_type": (string) El tipo de campaña recomendado (ej. "Performance Max").
    -   "ad_formats": (array of strings) Formatos de anuncio (ej. "Anuncios de Búsqueda").
    -   "monthly_budget": (number) **Presupuesto mensual estimado para ESTA plataforma, considerando el presupuesto total si se indica**.
    -   "targeting_suggestions": (array of strings) 2-3 ideas concretas de segmentación.
    -   "key_kpis": (array of strings) 2 KPIs clave con objetivos numéricos para esta estrategia (ej. "ROAS > 4").
    -   "creative_angle": (string) El enfoque creativo principal (ej. "Énfasis en la calidad", "Ofertas y descuentos"). **Debe estar alineado con la "Personalidad de Marca"**.
5.  **"total_monthly_budget"**: (number) La suma total de los \`monthly_budget\` de todas las estrategias.
6.  **"recommended_tools"**: (array of strings) 3-5 herramientas recomendadas (ej. "Semrush", "Mailchimp").
7.  **"calendar"**: (array de objetos) Un calendario para los primeros 3 meses. **Las acciones deben estar orientadas a cumplir el "Objetivo Principal Prioritario"**. Cada objeto tiene:
    -   "month": (string) ej. "Mes 1".
    -   "focus": (string) El enfoque principal del mes.
    -   "actions": (array of strings) Una lista detallada de 5 a 7 acciones concretas para ese mes.
8.  **"extra_recommendations"**: (array de strings) Basado en tu análisis de la URL proporcionada, ofrece 2-4 recomendaciones clave sobre SEO técnico o mejoras de experiencia de usuario (UX) que podrían impactar directamente en el rendimiento de las campañas (ej. velocidad de carga, optimización móvil, CTAs poco claros, etc.).
9.  **"fee_proposal"**: (object) Una propuesta de honorarios de agencia estándar.
    -   "setup_fee": (number) Coste de configuración inicial (ej. 1500).
    -   "management_fee": (number) Cuota de gestión mensual (ej. 2500).
    -   "fee_description": (string) Explica qué incluyen los honorarios.

Ahora, genera el plan estratégico completo en formato JSON.`;
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
  const template = Handlebars.compile(rawPrompt, { noEscape: true });
  const finalPrompt = template(input);
  
  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  let rawJson;
  try {
      rawJson = JSON.parse(response.text());
  } catch(e) {
      throw new Error("La IA devolvió una respuesta JSON inválida.");
  }
  
  // Data cleaning step
  if (rawJson.total_monthly_budget && typeof rawJson.total_monthly_budget === 'string') {
    rawJson.total_monthly_budget = parseFloat(rawJson.total_monthly_budget);
  }
  if (rawJson.fee_proposal) {
    if (typeof rawJson.fee_proposal.setup_fee === 'string') {
        rawJson.fee_proposal.setup_fee = parseFloat(rawJson.fee_proposal.setup_fee);
    }
    if (typeof rawJson.fee_proposal.management_fee === 'string') {
        rawJson.fee_proposal.management_fee = parseFloat(rawJson.fee_proposal.management_fee);
    }
  }
  if (rawJson.strategies && Array.isArray(rawJson.strategies)) {
      rawJson.strategies.forEach((strategy: any) => {
          if (strategy.monthly_budget && typeof strategy.monthly_budget === 'string') {
              strategy.monthly_budget = parseFloat(strategy.monthly_budget);
          }
      });
  }

  // Add the original input to the final plan object for persistence
  const finalPlan = {
      ...rawJson,
      ...input, // Add all input fields to the output
  };
  
  return CreateAdPlanOutputSchema.parse(finalPlan);
}
