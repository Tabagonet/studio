
import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';
import { adminDb } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

// Helper to fetch the custom prompt from Firestore
async function getAdPlanPrompt(uid: string): Promise<string> {
    const defaultPrompt = `Eres un experto de talla mundial en marketing digital, producto digital y posicionamiento de marca. Tienes acceso a una base de datos con múltiples estrategias probadas para distintos sectores (moda, tecnología, ecommerce, salud, educación, consultoría, logística, restauración, etc.) y debes generar una estrategia personalizada y ganadora.

Tu tarea es analizar la URL y el contexto proporcionado para generar una estrategia de marketing digital completa y detallada.
Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios ni markdown.

**INFORMACIÓN DE ENTRADA:**
- URL del negocio: {{url}}
- Objetivos de la campaña: {{#each objectives}}- {{this}}{{/each}}
- Duración del plan: {{plan_duration}} meses
{{#if additional_context}}
- Contexto Adicional Clave (prioridad máxima):
{{{additional_context}}}
{{/if}}

**PROCESO DE ANÁLISIS Y GENERACIÓN (Sigue estos pasos):**

1.  **Análisis Inicial:**
    - Visita y analiza la URL para comprender el negocio. Usa el contexto adicional como la fuente de verdad principal.
    - **Infiere** el tipo de producto/servicio (ej: moda, app, ecommerce, salud, formación online, consultoría, transporte, restaurante…).
    - **Infiere** el público objetivo principal (edad, género, ubicación, intereses, comportamiento de compra). Si no puedes determinarlo, descríbelo de forma genérica para el sector.
    - **Infiere** el presupuesto mensual más probable para un negocio de este tipo, o si no es posible, omite el campo 'budget_distribution'.

2.  **Generación de Estrategia JSON (Salida):**
    Genera un objeto JSON con las siguientes claves:

    -   "buyer_persona": (string) Describe el perfil psicográfico del cliente ideal en un párrafo.
    -   "value_proposition": (string) Una propuesta de valor clara y diferencial para el negocio.
    -   "funnel": (object) Un embudo completo con 6 etapas. Para cada etapa ('awareness', 'interest', 'consideration', 'conversion', 'retention', 'referral'), crea un objeto con:
        -   "objective": (string) El objetivo clave de esa etapa.
        -   "channels": (array of strings) Canales específicos recomendados (ej: "Google Ads", "Instagram Reels", "Email Marketing").
        -   "content_types": (array of strings) Tipos de contenido sugeridos (ej: "Vídeos educativos", "Casos de éxito", "Anuncios de remarketing").
        -   "kpis": (array of strings) 2-3 KPIs clave para medir el éxito en esa etapa (ej: "Alcance e Impresiones", "Tasa de Clics (CTR)", "Coste por Lead (CPL)").
    -   "media_plan": (object) con:
        -   "budget_distribution": (string) Describe cómo distribuirías el presupuesto inferido entre los canales.
        -   "campaign_suggestions": (array of strings) 2-3 ideas concretas de campañas (ej: "Campaña de Performance Max en Google para productos top", "Campaña de tráfico a la web en Meta Ads con lookalikes").
    -   "recommended_tools": (array of objects) Lista de herramientas. Cada objeto tiene:
        -   "category": (string) ej: "CRM y Automatización".
        -   "tools": (string) ej: "HubSpot, Mailchimp".
    -   "key_performance_indicators": (array of strings) 4-5 KPIs generales para medir el éxito global de toda la estrategia.
    -   "content_calendar": (array of objects) Un calendario para la duración del plan. Cada objeto tiene:
        -   "month": (string) ej: "Mes 1".
        -   "focus": (string) El enfoque para ese mes.
        -   "actions": (array of strings) 3-5 acciones concretas para ese mes.
    -   "strategic_recommendations": (object) con:
        -   "positioning": (string) Cómo debería posicionarse la marca.
        -   "tone_of_voice": (string) Tono de comunicación sugerido.
        -   "differentiation": (string) Ideas para diferenciarse de la competencia.

**BASES ESTRATÉGICAS POR SECTOR (Usa como inspiración):**
-   **Moda/Ropa:** Fuerte enfoque visual (Reels, carruseles), storytelling emocional, marketing de influencers, promociones por temporada.
-   **Tecnología/SaaS:** Demos de producto, campañas de instalación de apps, retención por email, contenido educativo en vídeo, remarketing web.
-   **Ecommerce/Local:** Geolocalización, Google My Business, SEO local, ventas flash, email de fidelización.
-   **Consultoría/Servicios:** Marca personal, lead magnets (guías, webinars), LinkedIn, testimonios.
-   **Transporte/Industrial:** Marketing B2B, Google Ads orientado a soluciones, casos de éxito, LinkedIn.
-   **Educación/Cursos:** Minicursos gratuitos, clases en vivo, funnels por email, YouTube.
-   **Salud/Bienestar:** Contenido empático y educativo, prueba gratuita o consulta inicial, reputación y reseñas.
-   **Restauración/Delivery:** Fotografía de alta calidad, promociones horarias (2x1), campañas geolocalizadas.

Ahora, genera el plan estratégico completo en formato JSON.
`;
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

  // Add the original input URL and objectives to the final plan object
  const finalPlan = {
      ...parsedJson,
      url: input.url,
      objectives: input.objectives,
      additional_context: input.additional_context,
  };
  
  return CreateAdPlanOutputSchema.parse(finalPlan);
}
