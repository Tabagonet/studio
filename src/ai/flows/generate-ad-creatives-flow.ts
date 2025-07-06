'use server';
/**
 * @fileOverview An ad creatives generation AI agent.
 */
import {ai} from '@/ai/genkit';
import { 
  GenerateAdCreativesInputSchema,
  type GenerateAdCreativesInput,
  GenerateAdCreativesOutputSchema,
  type GenerateAdCreativesOutput,
} from '@/app/(app)/ad-planner/schema';

const CREATIVES_PROMPT = `Eres un director creativo y copywriter senior en una agencia de marketing digital. Tu tarea es generar creativos publicitarios impactantes basados en una estrategia definida.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto Estratégico:**
- Plataforma: {{platform}}
- Tipo de Campaña: {{campaign_type}}
- Fase del Embudo: {{funnel_stage}}
- URL del Cliente: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}
- Público Objetivo: {{target_audience}}

**Instrucciones Creativas:**
Basado en el contexto, genera los siguientes recursos para la campaña:
1.  **"headlines"**: Crea una lista de 3 a 5 titulares cortos y potentes, optimizados para "{{platform}}". Deben captar la atención inmediatamente. Máximo 30-40 caracteres cada uno.
2.  **"descriptions"**: Crea una lista de 2 a 3 descripciones persuasivas para el cuerpo del anuncio. Deben complementar los titulares y expandir el mensaje. Máximo 90 caracteres cada una.
3.  **"cta_suggestions"**: Propón una lista de 2 a 3 llamadas a la acción (Call to Action) claras y directas.
4.  **"visual_ideas"**: Describe una lista de 2 a 3 conceptos visuales para la imagen o el vídeo del anuncio. Piensa en el estilo, los elementos a mostrar y la emoción a transmitir.

Genera la respuesta en formato JSON.`;

const prompt = ai.definePrompt({
  name: 'generateAdCreativesPrompt',
  input: { schema: GenerateAdCreativesInputSchema },
  output: { schema: GenerateAdCreativesOutputSchema },
  prompt: CREATIVES_PROMPT,
});

const generateAdCreativesFlow = ai.defineFlow(
  {
    name: 'generateAdCreativesFlow',
    inputSchema: GenerateAdCreativesInputSchema,
    outputSchema: GenerateAdCreativesOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);

export async function generateAdCreatives(input: GenerateAdCreativesInput): Promise<GenerateAdCreativesOutput> {
  return generateAdCreativesFlow(input);
}
