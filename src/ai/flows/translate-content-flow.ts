'use server';
/**
 * @fileOverview An AI flow for translating structured content.
 * This flow is designed to be called from various API routes.
 *
 * - translateContent - Handles translation of key-value pairs.
 * - TranslateContentInput - The Zod schema for the flow's input.
 * - TranslateContentOutput - The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

export const TranslateContentInputSchema = z.object({
  contentToTranslate: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

export const TranslateContentOutputSchema = z.record(z.string());
export type TranslateContentOutput = z.infer<typeof TranslateContentOutputSchema>;


const translateContentFlow = ai.defineFlow(
  {
    name: 'translateContentFlow',
    inputSchema: TranslateContentInputSchema,
    outputSchema: TranslateContentOutputSchema,
  },
  async (input: TranslateContentInput): Promise<TranslateContentOutput> => {
    const { contentToTranslate, targetLanguage } = input;
    
    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
    const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
    
    const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        system: systemInstruction,
        prompt: prompt,
        output: {
            schema: TranslateContentOutputSchema
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


export async function translateContent(input: TranslateContentInput): Promise<TranslateContentOutput> {
    return translateContentFlow(input);
}
