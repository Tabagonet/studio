
'use server';
/**
 * @fileOverview Defines the Zod schemas and a wrapper function for the translation flow.
 * The actual Genkit flow is kept internal to this module to prevent Next.js build issues.
 *
 * - translateContent - The public-facing async function to call for translations.
 * - TranslateContentInputSchema - The Zod schema for the input.
 * - TranslateContentOutputSchema - The Zod schema for the output.
 */

import { z } from 'zod';
import { ai } from '@/ai/genkit';

export const TranslateContentInputSchema = z.object({
  contentToTranslate: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

export const TranslateContentOutputSchema = z.record(z.string());
export type TranslateContentOutput = z.infer<typeof TranslateContentOutputSchema>;


const translateFlow = ai.defineFlow(
    {
        name: 'translateContentFlow',
        inputSchema: TranslateContentInputSchema,
        outputSchema: TranslateContentOutputSchema,
    },
    async (input) => {
        const { contentToTranslate, targetLanguage } = input;
  
        const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
        const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
        
        const { output } = await ai.generate({
            model: 'googleai/gemini-1.5-flash-latest',
            system: systemInstruction,
            prompt: prompt,
            output: {
                schema: TranslateContentOutputSchema,
            },
        });

        if (!output || typeof output !== 'object') {
            throw new Error('AI returned a non-object or empty response for translation.');
        }
        
        return output;
    }
);

/**
 * The public-facing function to execute the translation flow.
 * @param {TranslateContentInput} input - The content to translate and the target language.
 * @returns {Promise<TranslateContentOutput>} The translated content.
 */
export async function translateContent(input: TranslateContentInput): Promise<TranslateContentOutput> {
    return translateFlow(input);
}
