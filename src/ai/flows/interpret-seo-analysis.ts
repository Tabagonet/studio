
'use server';
/**
 * @fileOverview An AI flow to interpret SEO analysis data.
 *
 * - interpretSeoAnalysis - A function that takes raw SEO data and provides expert interpretation and an action plan.
 * - SeoAnalysisInput - The input type for the flow.
 * - SeoInterpretationOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const SeoAnalysisInputSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  headings: z.array(z.object({ tag: z.string(), text: z.string() })),
  images: z.array(z.object({ src: z.string().optional(), alt: z.string() })),
  aiAnalysis: z.object({
    score: z.number(),
    summary: z.string(),
    positives: z.array(z.string()),
    improvements: z.array(z.string()),
  }),
});
export type SeoAnalysisInput = z.infer<typeof SeoAnalysisInputSchema>;

export const SeoInterpretationOutputSchema = z.object({
  interpretation: z.string().describe('A narrative paragraph explaining the most important SEO data points in a simple, easy-to-understand way.'),
  actionPlan: z.array(z.string()).describe('A bulleted list of the top 3-5 most impactful and actionable steps to improve the page\'s SEO.'),
});
export type SeoInterpretationOutput = z.infer<typeof SeoInterpretationOutputSchema>;


export async function interpretSeoAnalysis(input: SeoAnalysisInput): Promise<SeoInterpretationOutput> {
  return interpretSeoFlow(input);
}


const prompt = ai.definePrompt({
    name: 'interpretSeoPrompt',
    input: { schema: SeoAnalysisInputSchema },
    output: { schema: SeoInterpretationOutputSchema },
    prompt: `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
    The user has received the following raw data from an analysis tool.
    Your task is to interpret this data and provide a clear, actionable summary in Spanish.

    **Analysis Data:**
    - Page Title: "{{title}}"
    - Meta Description: "{{metaDescription}}"
    - H1 Heading: "{{h1}}"
    - SEO Score: {{aiAnalysis.score}}/100
    - AI Summary: {{aiAnalysis.summary}}
    - AI Positives: {{#each aiAnalysis.positives}}- {{this}}\n{{/each}}
    - AI Improvements: {{#each aiAnalysis.improvements}}- {{this}}\n{{/each}}
    - Total Images: {{images.length}}

    **Your Task:**
    Based on all the data above, generate a JSON object with two keys:

    1.  "interpretation": Write a narrative paragraph in Spanish that interprets the key findings. Explain WHY the score is what it is, focusing on the most critical elements (e.g., "La puntuación de {{aiAnalysis.score}} se debe principalmente a un título bien optimizado, pero se ve penalizada por la ausencia de una meta descripción, lo que es una oportunidad perdida para atraer clics en Google."). Synthesize the positives and improvements into a coherent explanation.

    2.  "actionPlan": Create a list of the 3 to 5 most important, high-impact, and actionable steps the user should take to improve the page's SEO. Frame these as clear instructions. For example: "Revisar el título para que no supere los 60 caracteres y contenga la palabra clave principal." or "Añadir una meta descripción atractiva de unos 150 caracteres que incite al clic.".
    `,
});

const interpretSeoFlow = ai.defineFlow(
  {
    name: 'interpretSeoFlow',
    inputSchema: SeoAnalysisInputSchema,
    outputSchema: SeoInterpretationOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
