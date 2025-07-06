'use server';
/**
 * @fileOverview A strategy tasks generation AI agent.
 */
import {ai} from '@/ai/genkit';
import { 
  GenerateStrategyTasksInputSchema,
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

const prompt = ai.definePrompt({
  name: 'generateStrategyTasksPrompt',
  input: { schema: GenerateStrategyTasksInputSchema },
  output: { schema: GenerateStrategyTasksOutputSchema },
  prompt: TASKS_PROMPT,
});

const generateStrategyTasksFlow = ai.defineFlow(
  {
    name: 'generateStrategyTasksFlow',
    inputSchema: GenerateStrategyTasksInputSchema,
    outputSchema: GenerateStrategyTasksOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);


export async function generateStrategyTasks(input: GenerateStrategyTasksInput): Promise<GenerateStrategyTasksOutput> {
  return generateStrategyTasksFlow(input);
}
