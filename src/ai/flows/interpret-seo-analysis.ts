'use server';
/**
 * @fileOverview An AI flow to interpret SEO analysis data.
 *
 * - interpretSeoAnalysis - A function that takes raw SEO data and provides expert interpretation and an action plan.
 * - SeoAnalysisInput - The input type for the flow.
 * - SeoInterpretationOutput - The return type for the flow.
 */

import {defineFlow} from '@genkit-ai/core';
import {generate} from '@genkit-ai/ai';
import {googleAI} from '@genkit-ai/googleai';
import {z} from 'zod';

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
  headings: z.array(z.object({tag: z.string(), text: z.string()})),
  images: z.array(z.object({src: z.string().optional(), alt: z.string()})),
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
  interpretation: z
    .string()
    .describe(
      "A narrative paragraph explaining the most important SEO data points in a simple, easy-to-understand way."
    ),
  actionPlan: z
    .array(z.string())
    .describe(
      "A bulleted list of the top 3-5 most impactful and actionable steps to improve the page's SEO."
    ),
  positives: z
    .array(z.string())
    .describe('A bulleted list of 2-4 key SEO strengths of the page.'),
  improvements: z
    .array(z.string())
    .describe(
      "A bulleted list of 2-4 key areas for SEO improvement, focusing on high-level concepts rather than repeating the action plan."
    ),
});
export type SeoInterpretationOutput = z.infer<
  typeof SeoInterpretationOutputSchema
>;

// This internal constant is not exported.
export const interpretSeoAnalysis = defineFlow(
  {
    name: 'interpretSeoAnalysisFlow',
    inputSchema: SeoAnalysisInputSchema,
    outputSchema: SeoInterpretationOutputSchema,
  },
  async (input: SeoAnalysisInput) => {
    const checksSummary = JSON.stringify(input.aiAnalysis.checks, null, 2);

    const {output} = await generate({
      model: googleAI('gemini-1.5-flash-latest'),
      output: {
        format: 'json',
        schema: SeoInterpretationOutputSchema,
      },
      prompt: `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
    The user has received the following raw data from an analysis tool.
    Your task is to interpret this data and provide a clear, actionable summary in Spanish.

    **Analysis Data:**
    - Page Title: "${input.title}"
    - Meta Description: "${input.metaDescription}"
    - H1 Heading: "${input.h1}"
    - SEO Score: ${input.aiAnalysis.score}/100
    - Technical SEO Checks (true = passed, false = failed):
    ${checksSummary}

    **Your Task:**
    Based on all the data above, generate a JSON object with four keys:

    1.  "interpretation": Write a narrative paragraph in Spanish that interprets the key findings. Explain WHY the score is what it is, focusing on the most critical elements based on the failed checks (e.g., "La puntuación de ${input.aiAnalysis.score} es baja porque el título SEO no contiene la palabra clave y la meta descripción es demasiado corta. Sin embargo, la estructura de encabezados es correcta, lo cual es un buen punto de partida."). Synthesize the technical checks into a coherent explanation.

    2.  "actionPlan": Create a list of the 3 to 5 most important, high-impact, and actionable steps the user should take to improve the page's SEO, prioritizing the failed checks. Frame these as clear instructions. For example: "Revisar el título para que no supere los 60 caracteres y contenga la palabra clave principal." or "Añadir una meta descripción atractiva de unos 150 caracteres que incite al clic.".
    
    3.  "positives": Create a list of 2-4 key SEO strengths of the page. What is the page doing well from an SEO perspective?

    4.  "improvements": Create a list of 2-4 key areas for SEO improvement, focusing on high-level concepts rather than repeating the action plan. For example: "Falta de optimización en el título y meta descripción para SEO." or "La página carece de palabras clave adicionales relacionadas con el tema".
    `,
    });
    if (!output) {
      throw new Error('AI returned an empty response.');
    }
    return output;
  }
);
