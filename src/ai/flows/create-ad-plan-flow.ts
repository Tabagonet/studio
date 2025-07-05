
'use server';

import { GoogleGenerativeAI } from "@google/generative-ai";
import { CreateAdPlanInput, CreateAdPlanOutput, CreateAdPlanOutputSchema } from '@/app/(app)/ad-planner/schema';

export async function createAdPlan(input: CreateAdPlanInput): Promise<CreateAdPlanOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

  const prompt = `
    Eres un estratega senior de marketing digital y publicidad online. Tu tarea es analizar una web y un objetivo de negocio para crear un plan de publicidad digital profesional, detallado y listo para presentar a un cliente.

    **Contexto:**
    - URL a analizar: ${input.url}
    - Objetivo principal de la campaña: "${input.objective}"

    **Instrucciones:**
    1.  Analiza el contenido de la URL para entender el producto, servicio, y público actual.
    2.  Basado en el objetivo, desarrolla una estrategia de publicidad digital coherente.
    3.  Define las plataformas más adecuadas (Google, Meta, LinkedIn, etc.), el presupuesto y las acciones.
    4.  Crea un calendario de implementación para los primeros 3 meses.
    5.  Propón una estructura de honorarios profesional.
    6.  Tu respuesta DEBE ser un único objeto JSON válido, sin comentarios, texto introductorio, ni markdown \`\`\`.

    **Estructura JSON Requerida:**
    {
      "executive_summary": "string (Resumen ejecutivo del plan, explicando la lógica general.)",
      "target_audience": "string (Descripción detallada del público objetivo ideal.)",
      "strategies": [{
        "platform": "string (Plataforma publicitaria (ej. Google Ads, Meta Ads, LinkedIn Ads).)",
        "strategy": "string (Descripción de la estrategia para esta plataforma.)",
        "ad_formats": ["string (Formatos de anuncio recomendados (ej. Búsqueda, Display, Video, Lead Gen Form).)")],
        "monthly_budget": "number (Presupuesto mensual recomendado para esta plataforma.)"
      }],
      "total_monthly_budget": "number (Suma total de los presupuestos mensuales de todas las plataformas.)",
      "calendar": [{
        "month": "string (Mes del hito (ej. 'Mes 1', 'Mes 2').)",
        "focus": "string (El enfoque principal o la meta para ese mes.)",
        "actions": ["string (Acciones específicas a realizar durante ese mes.)"]
      }],
      "kpis": ["string (KPIs clave para medir el éxito (ej. CPA, ROAS, CTR).)")],
      "fee_proposal": {
        "setup_fee": "number (Precio por la configuración inicial de las campañas.)",
        "management_fee": "number (Precio por la gestión mensual recurrente.)",
        "fee_description": "string (Descripción de los servicios incluidos en los honorarios.)"
      }
    }

    Analiza la URL y el objetivo, y genera el objeto JSON completo con tu plan estratégico.
  `;

  const result = await model.generateContent(prompt);
  const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
  const parsedJson = JSON.parse(responseText);
  
  return CreateAdPlanOutputSchema.parse(parsedJson);
}
