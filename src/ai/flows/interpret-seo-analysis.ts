
'use server';
/**
 * @fileOverview An AI flow to interpret SEO analysis data.
 *
 * - interpretSeoAnalysis - A function that takes raw SEO data and provides expert interpretation and an action plan.
 * - SeoAnalysisInput - The input type for the flow.
 * - SeoInterpretationOutput - The return type for the flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const aiChecksSchema = z.object({
    titleContainsKeyword: z.boolean(),
    titleIsGoodLength: z.boolean(),
    metaDescriptionContainsKeyword: z.boolean(),
    metaDescriptionIsGoodLength: z.boolean(),
    keywordInFirstParagraph: z.boolean(),
    contentHasImages: z.boolean(),
    allImagesHaveAltText: z.boolean(),
    h1Exists: z.boolean(),
    canonicalUrlExists: z.boolean(),
});

export const SeoAnalysisInputSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  headings: z.array(z.object({ tag: z.string(), text: z.string() })),
  images: z.array(z.object({ src: z.string().optional(), alt: z.string() })),
  aiAnalysis: z.object({
    score: z.number(),
    checks: aiChecksSchema,
    suggested: z.object({
        title: z.string(),
        metaDescription: z.string(),
        focusKeyword: z.string(),
    }),
  }),
});
export type SeoAnalysisInput = z.infer<typeof SeoAnalysisInputSchema>;

export const SeoInterpretationOutputSchema = z.object({
  interpretation: z.string().describe('A narrative paragraph explaining the most important SEO data points in a simple, easy-to-understand way.'),
  actionPlan: z.array(z.string()).describe('A bulleted list of the top 3-5 most impactful and actionable steps to improve the page\'s SEO.'),
});
export type SeoInterpretationOutput = z.infer<typeof SeoInterpretationOutputSchema>;

// This internal constant is not exported.
const interpretSeoAnalysisFlowInternal = ai.defineFlow(
  {
    name: 'interpretSeoAnalysisFlow',
    inputSchema: SeoAnalysisInputSchema,
    outputSchema: SeoInterpretationOutputSchema,
  },
  async (input: SeoAnalysisInput) => {
    const checksSummary = JSON.stringify(input.aiAnalysis.checks, null, 2);
    
    const interpretSeoPrompt = ai.definePrompt({
        name: 'interpretSeoPrompt',
        input: { schema: SeoAnalysisInputSchema.extend({ checksSummary: z.string() }) },
        output: { schema: SeoInterpretationOutputSchema },
        prompt: `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
    The user has received the following raw data from an analysis tool.
    Your task is to interpret this data and provide a clear, actionable summary in Spanish.

    **Analysis Data:**
    - Page Title: "{{{title}}}"
    - Meta Description: "{{{metaDescription}}}"
    - H1 Heading: "{{{h1}}}"
    - SEO Score: {{{aiAnalysis.score}}}/100
    - Technical SEO Checks (true = passed, false = failed):
    {{{checksSummary}}}

    **Your Task:**
    Based on all the data above, generate a JSON object with two keys:

    1.  "interpretation": Write a narrative paragraph in Spanish that interprets the key findings. Explain WHY the score is what it is, focusing on the most critical elements based on the failed checks (e.g., "La puntuación de {{{aiAnalysis.score}}} es baja porque el título SEO no contiene la palabra clave y la meta descripción es demasiado corta. Sin embargo, la estructura de encabezados es correcta, lo cual es un buen punto de partida."). Synthesize the technical checks into a coherent explanation.

    2.  "actionPlan": Create a list of the 3 to 5 most important, high-impact, and actionable steps the user should take to improve the page's SEO, prioritizing the failed checks. Frame these as clear instructions. For example: "Revisar el título para que no supere los 60 caracteres y contenga la palabra clave principal." or "Añadir una meta descripción atractiva de unos 150 caracteres que incite al clic.".
    `,
    });
    
    const { output } = await interpretSeoPrompt({ ...input, checksSummary });
    if (!output) {
      throw new Error('AI returned an empty response.');
    }
    return output;
  }
);

// This is the only exported function. It's a simple async wrapper.
export async function interpretSeoAnalysis(input: SeoAnalysisInput): Promise<SeoInterpretationOutput> {
  return interpretSeoAnalysisFlowInternal(input);
}
