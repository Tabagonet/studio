
'use server';
/**
 * @fileOverview A strategy tasks generation AI agent.
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import Handlebars from 'handlebars';
import { 
  type GenerateStrategyTasksInput, 
  GenerateStrategyTasksOutputSchema,
  type GenerateStrategyTasksOutput
} from '@/app/(app)/ad-planner/schema';


const TASKS_PROMPT = `Eres un director de proyectos de marketing digital. Tu tarea es analizar una estrategia publicitaria y desglosarla en tareas concretas y accionables, estimando las horas necesarias para cada una.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto General:**
- URL del Cliente: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}

**Estrategia a Desglosar:**
- Plataforma: {{platform}}
- Tipo de Campaña: {{campaign_type}}
- Fase del Embudo: {{funnel_stage}}
- Justificación: {{strategy_rationale}}

**Instrucciones:**
Basado en la estrategia anterior, genera una lista de 5 a 7 tareas detalladas para el primer mes. Para cada tarea, proporciona:
1.  **"name"**: El nombre de la tarea (ej. "Investigación de palabras clave y audiencia").
2.  **"hours"**: Un número que represente tu estimación de horas (ej. 4.5).

**Ejemplo de Tarea:**
{ "name": "Configuración del seguimiento de conversiones en Google Analytics 4", "hours": 3 }

Genera la lista de tareas.`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function generateStrategyTasks(input: GenerateStrategyTasksInput): Promise<GenerateStrategyTasksOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest", 
      generationConfig: { responseMimeType: "application/json" },
      safetySettings
  });

  const template = Handlebars.compile(TASKS_PROMPT, { noEscape: true });
  const finalPrompt = template(input);
  
  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  let rawJson;
  try {
      rawJson = JSON.parse(response.text());
  } catch(e) {
      throw new Error("La IA devolvió una respuesta JSON inválida.");
  }

  return GenerateStrategyTasksOutputSchema.parse(rawJson);
}
