'use server';

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

**Proceso de Análisis (Sigue estos pasos rigurosamente):**
1.  **Comprensión del Negocio:** Primero, visita y analiza la URL para entender a fondo el negocio. Determina:
    -   ¿Cuáles son sus productos o servicios principales? (Ej: "Servicios de fumigación con drones", "Venta de zapatos de cuero").
    -   ¿Cuál es su mercado principal? (Ej: "Agricultores en España", "Consumidores de moda online").
    -   ¿Es un negocio B2B o B2C?

2.  **Identificación de Palabras Clave:** Basado en tu comprensión, genera 3-5 palabras clave de búsqueda que un cliente potencial usaría para encontrar esta empresa. (Ej: "drones fumigadores precio", "empresa de topografía con drones", "comprar zapatos de hombre online").

3.  **Búsqueda y Selección de Competidores:** Utilizando las palabras clave que identificaste, simula una búsqueda en Google para encontrar de 2 a 3 competidores **directos y relevantes**. Ignora marketplaces gigantes como Amazon, Alibaba o directorios generales, a menos que la empresa analizada sea de una escala similar. Enfócate en empresas que ofrezcan productos o servicios muy similares.

4.  **Análisis Publicitario:** Para cada competidor que has identificado, investiga y resume su actividad publicitaria online.

5.  **Generación del Informe JSON:** Genera una respuesta en formato JSON con una clave "competitors", que contenga un array de objetos. Cada objeto debe representar a un competidor y tener las siguientes claves:
    -   **"competitor_name"**: El nombre de la empresa competidora.
    -   **"key_platforms"**: Un string con las plataformas publicitarias clave que parecen utilizar (ej. "Google Ads (Búsqueda y Display), Meta Ads (Facebook & Instagram)").
    -   **"estimated_monthly_budget"**: Una estimación numérica aproximada de su inversión publicitaria mensual en euros. Basa tu estimación en la intensidad y alcance de su actividad.
    -   **"strategy_summary"**: Un resumen conciso de su estrategia aparente. ¿Se enfocan en ofertas, en marca, en un nicho específico, en marketing de contenidos?
    -   **"creative_angle"**: Describe el enfoque o mensaje principal que utilizan en sus anuncios (ej. "Énfasis en la precisión y el ahorro para agricultores", "Enfoque en la calidad y el lujo", "Precios bajos y ofertas").

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

Genera el análisis ahora.`;

export async function competitorAnalysis(input: CompetitorAnalysisInput): Promise<CompetitorAnalysisOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

  const template = Handlebars.compile(COMPETITOR_ANALYSIS_PROMPT, { noEscape: true });
  const prompt = template(input);
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsedJson = JSON.parse(responseText);
  
  return CompetitorAnalysisOutputSchema.parse(parsedJson);
}
