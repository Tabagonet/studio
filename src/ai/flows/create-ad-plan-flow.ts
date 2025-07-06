
'use server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminDb } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

// Helper to fetch the custom prompt from Firestore
async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un estratega senior de marketing digital. Tu tarea es analizar una URL, unos objetivos y un contexto opcional para crear un plan de publicidad profesional y detallado.
Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios ni markdown.

**INFORMACIÓN DE ENTRADA:**
- URL del negocio: {{url}}
- Objetivos de la campaña: {{#each objectives}}- {{this}}{{/each}}
{{#if additional_context}}
- Contexto Adicional Clave (prioridad máxima):
{{{additional_context}}}
{{/if}}

**PROCESO DE ANÁLISIS Y GENERACIÓN (Sigue estos pasos):**
1.  **Análisis Inicial:**
    - Visita y analiza la URL para comprender el negocio. Usa el contexto adicional como la fuente de verdad principal.
    - **Infiere** el tipo de producto/servicio (ej: moda, app, ecommerce, salud, formación online, consultoría, transporte, restaurante…).
    - **Infiere** el público objetivo principal (edad, género, ubicación, intereses, comportamiento de compra). Si no puedes determinarlo, descríbelo de forma genérica para el sector.
    - **Estima** un presupuesto mensual total y realista para un negocio de este tipo. Sé concreto (ej. 3000, 8000, 15000).

2.  **Generación de Estrategia JSON (Salida):**
    Genera un objeto JSON con las siguientes claves:

    -   "executive_summary": (string) Un resumen ejecutivo de la estrategia general en 2-3 párrafos.
    -   "target_audience": (string) Describe el perfil psicográfico del cliente ideal en un párrafo.
    -   "total_monthly_budget": (number) La suma total de los presupuestos de todas las estrategias.
    -   "strategies": (array de objetos) Propón de 2 a 4 estrategias, una para cada plataforma principal (ej. Google Ads, Meta Ads). Cada objeto debe tener:
        -   "platform": (string) El nombre de la plataforma (ej. "Google Ads").
        -   "strategy_rationale": (string) Justificación de por qué esta plataforma es adecuada.
        -   "funnel_stage": (string, enum: "Awareness", "Consideration", "Conversion") La fase del embudo a la que se dirige principalmente.
        -   "campaign_type": (string) El tipo de campaña recomendado (ej. "Performance Max", "Búsqueda", "Shopping", "Tráfico a la web").
        -   "ad_formats": (array of strings) Los formatos de anuncio sugeridos (ej. "Anuncios de Búsqueda", "Anuncios de Display", "Video Ads", "Carrusel").
        -   "monthly_budget": (number) El presupuesto mensual estimado para ESTA plataforma.
        -   "targeting_suggestions": (array of strings) 2-3 ideas concretas de segmentación (ej. "Públicos afines: 'amantes de la moda sostenible'", "Remarketing a visitantes de los últimos 30 días", "Palabras clave: 'comprar zapatos de cuero Madrid'").
        -   "key_kpis": (array of strings) 2 KPIs clave para esta estrategia (ej. "ROAS", "Coste por Lead").
        -   "creative_angle": (string) El enfoque creativo principal (ej. "Énfasis en la calidad artesanal y el confort", "Ofertas y descuentos por tiempo limitado").
    -   "kpis": (array of strings) 4-5 KPIs generales para medir el éxito de TODA la estrategia.
    -   "calendar": (array de objetos) Un calendario para los primeros 3 meses. Cada objeto tiene:
        -   "month": (string) ej. "Mes 1".
        -   "focus": (string) El enfoque para ese mes.
        -   "actions": (array of strings) 3-5 acciones concretas para ese mes.
    -   "fee_proposal": (object) Propuesta de honorarios.
        -   "setup_fee": (number) Un coste de configuración inicial.
        -   "management_fee": (number) Una cuota de gestión mensual.
        -   "fee_description": (string) Explica qué incluyen los honorarios.

**BASES ESTRATÉGICAS POR SECTOR (Usa como inspiración):**
-   **Moda/Ropa:** Fuerte enfoque visual (Reels, carruseles), storytelling emocional, marketing de influencers, promociones por temporada.
-   **Tecnología/SaaS:** Demos de producto, campañas de instalación de apps, retención por email, contenido educativo en vídeo, remarketing web.
-   **Ecommerce/Local:** Geolocalización, Google My Business, SEO local, ventas flash, email de fidelización.
-   **Consultoría/Servicios:** Marca personal, lead magnets (guías, webinars), LinkedIn, testimonios.
-   **Transporte/Industrial:** Marketing B2B, Google Ads orientado a soluciones, casos de éxito, LinkedIn.
-   **Educación/Cursos:** Minicursos gratuitos, clases en vivo, funnels por email, YouTube.
-   **Salud/Bienestar:** Contenido empático y educativo, prueba gratuita o consulta inicial, reputación y reseñas.
-   **Restauración/Delivery:** Fotografía de alta calidad, promociones horarias (2x1), campañas geolocalizadas.

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
