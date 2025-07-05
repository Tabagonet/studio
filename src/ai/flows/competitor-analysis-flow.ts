'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';
import {
  type CompetitorAnalysisInput,
  type CompetitorAnalysisOutput,
  CompetitorAnalysisOutputSchema
} from '@/app/(app)/ad-planner/schema';

const COMPETITOR_ANALYSIS_PROMPT = `Eres un analista de inteligencia competitiva de clase mundial, especializado en marketing digital. Tu tarea es analizar una URL de una empresa y realizar una investigación de mercado para identificar a sus principales competidores y sus estrategias publicitarias. Tu respuesta DEBE ser un único objeto JSON válido.

**URL de la Empresa a Analizar:**
{{url}}

**Instrucciones:**
1.  Identifica de 2 a 3 de los competidores más directos y relevantes para la empresa en la URL proporcionada.
2.  Para cada competidor, investiga y resume su actividad publicitaria online.
3.  Genera una respuesta en formato JSON con una clave "competitors", que contenga un array de objetos. Cada objeto debe representar a un competidor y tener las siguientes claves:
    -   **"competitor_name"**: El nombre de la empresa competidora.
    -   **"key_platforms"**: Un string con las plataformas publicitarias clave que parecen utilizar (ej. "Google Ads, Meta Ads, TikTok").
    -   **"estimated_monthly_budget"**: Una estimación numérica aproximada de su inversión publicitaria mensual en euros. Basa tu estimación en la intensidad y alcance de su actividad.
    -   **"strategy_summary"**: Un resumen conciso de su estrategia aparente. ¿Se enfocan en ofertas, en marca, en un nicho específico?
    -   **"creative_angle"**: Describe el enfoque o mensaje principal que utilizan en sus anuncios (ej. "Humor y contenido viral", "Énfasis en la calidad y el lujo", "Precios bajos y ofertas").

**Ejemplo de Salida:**
{
  "competitors": [
    {
      "competitor_name": "Ejemplo Competidor A",
      "key_platforms": "Meta Ads, Google Shopping",
      "estimated_monthly_budget": 15000,
      "strategy_summary": "Se centran en la conversión directa con anuncios de producto y remarketing agresivo. Poca inversión en branding.",
      "creative_angle": "Promociones y descuentos directos para impulsar la compra inmediata."
    }
  ]
}

Genera el análisis.`;

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
