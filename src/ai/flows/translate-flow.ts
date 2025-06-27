'use server';
/**
 * @fileOverview An AI flow for translating structured content.
 *
 * - translate - Handles translation of key-value pairs.
 * - TranslateInput - The Zod schema for the flow's input.
 * - TranslateOutput - The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const TranslateInputSchema = z.object({
  content: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateInput = z.infer<typeof TranslateInputSchema>;

// The output is dynamic, so we use z.record(z.string())
export const TranslateOutputSchema = z.record(z.string());
export type TranslateOutput = z.infer<typeof TranslateOutputSchema>;


const translateFlow = ai.defineFlow(
  {
    name: 'translateFlow',
    inputSchema: TranslateInputSchema,
    outputSchema: TranslateOutputSchema,
  },
  async (input: TranslateInput): Promise<TranslateOutput> => {
    const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        system: `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`,
        prompt: `Translate the following content to ${input.targetLanguage}:\n\n${JSON.stringify(input.content)}`,
        output: {
            schema: TranslateOutputSchema
        }
    });

    if (!output) {
      throw new Error('AI returned an empty response for translation.');
    }
    
    // Basic validation to ensure it's an object with string values
    if (typeof output === 'object' && output !== null) {
      return output;
    }
    
    throw new Error('AI returned a non-object response.');
  }
);

export async function translate(input: TranslateInput): Promise<TranslateOutput> {
  return translateFlow(input);
}
