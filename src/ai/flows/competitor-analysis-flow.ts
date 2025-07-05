
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';
import {
  type CompetitorAnalysisInput,
  type CompetitorAnalysisOutput,
  CompetitorAnalysisOutputSchema
} from '@/app/(app)/ad-planner/schema';

const COMPETITOR_ANALYSIS_PROMPT = `Eres un analista de inteligencia competitiva de clase mundial, especializado en marketing digital y SEO. Tu tarea es realizar un análisis de competencia para la empresa en la URL proporcionada. Tu respuesta DEBE ser un único objeto JSON válido.

**URL de la Empresa a Analizar:**
{{url}}

**Contexto Adicional (si se proporciona):**
{{additional_context}}

**Proceso de Análisis (Sigue estos pasos rigurosamente):**
1.  **Comprensión del Negocio y Ubicación:** Primero, visita y analiza la URL para entender a fondo el negocio. Utiliza el contexto adicional como la fuente de verdad principal si se proporciona. Determina:
    -   ¿Cuáles son sus productos o servicios principales? (Ej: "Servicios de fumigación con drones", "Venta de zapatos de cuero").
    -   ¿Cuál es su **área de servicio o mercado principal**? Sé específico. Si es una empresa de servicios locales, **identifica la ciudad o región** (Ej: "Servicios de topografía en Madrid, España", "Tienda online de moda para toda Europa"). Esta ubicación es CRÍTICA.
    -   ¿Es un negocio B2B o B2C?

2.  **Identificación de Palabras Clave:** Basado en tu comprensión, genera 3-5 palabras clave de búsqueda que un cliente potencial usaría. **Si el negocio es local, incluye la ubicación en las palabras clave** (Ej: "drones fumigadores precio Andalucía", "empresa de topografía Madrid").

3.  **Búsqueda y Selección de Competidores:** Utilizando las palabras clave que identificaste, simula una búsqueda en Google para encontrar de 2 a 3 competidores **directos y relevantes**. 
    -   **Prioridad Geográfica:** Si el negocio es local, los competidores DEBEN ser de la misma área geográfica.
    -   **Relevancia:** Enfócate en empresas que ofrezcan productos o servicios muy similares. Ignora marketplaces gigantes como Amazon, Alibaba o directorios generales.

4.  **Análisis Publicitario (Inferencia):** Para cada competidor que has identificado, **infiere su estrategia publicitaria más probable**. No tienes acceso en tiempo real, así que basa tus deducciones en patrones típicos del sector y la escala del negocio.
    -   *Ejemplo de inferencia:* Una empresa de software B2B probablemente use Google Ads para búsquedas específicas ("software CRM para pymes") y LinkedIn Ads para llegar a roles profesionales. Una tienda local de moda seguramente usará Meta Ads (Instagram/Facebook) con anuncios visuales y segmentación geográfica.

5.  **Generación del Informe JSON:** Genera una respuesta en formato JSON con una clave "competitors", que contenga un array de objetos. Cada objeto debe representar a un competidor y tener las siguientes claves:
    -   **"competitor_name"**: El nombre de la empresa competidora.
    -   **"key_platforms"**: Un string con las plataformas publicitarias clave que **probablemente** utilizan (ej. "Google Ads (Búsqueda y Display), Meta Ads (Facebook & Instagram)").
    -   **"estimated_monthly_budget"**: Una estimación numérica **aproximada** de su inversión publicitaria mensual en euros. Basa tu estimación en la intensidad y alcance de su actividad inferida.
    -   **"strategy_summary"**: Un resumen conciso de su estrategia **aparente**. ¿Se enfocan en ofertas, en marca, en un nicho específico, en marketing de contenidos?
    -   **"creative_angle"**: Describe el enfoque o mensaje principal que **probablemente** utilizan en sus anuncios (ej. "Énfasis en la precisión y el ahorro para agricultores", "Enfoque en la calidad y el lujo", "Precios bajos y ofertas").

**Ejemplo de Salida para una empresa de drones agrícolas:**
{
  "competitors": [
    {
      "competitor_name": "AgroDron Solutions",
      "key_platforms": "Google Ads (Búsqueda), LinkedIn Ads",
      "estimated_monthly_budget": 8000,
      "strategy_summary": "Enfocados en B2B, captando leads a través de la búsqueda de servicios específicos. Usan LinkedIn para branding y llegar a gestores de fincas.",
      "creative_angle": "Profesionalidad, tecnología avanzada y estudios de caso con datos de ahorro."
    }
  ]
}

Genera el análisis ahora. Si no encuentras competidores relevantes, devuelve un array vacío para la clave "competitors".`;

export async function competitorAnalysis(input: CompetitorAnalysisInput): Promise<CompetitorAnalysisOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

  const template = Handlebars.compile(COMPETITOR_ANALYSIS_PROMPT, { noEscape: true });
  const prompt = template(input);
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsedJson = JSON.parse(responseText);
  
  // Data cleaning step to prevent malformed data from breaking the app
  if (parsedJson.competitors && Array.isArray(parsedJson.competitors)) {
    parsedJson.competitors = parsedJson.competitors.filter((c: any) => 
      c && typeof c.competitor_name === 'string' && c.competitor_name.trim() !== ''
    );
  }
  
  return CompetitorAnalysisOutputSchema.parse(parsedJson);
}
