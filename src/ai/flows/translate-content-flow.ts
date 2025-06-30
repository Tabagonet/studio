'use server';
/**
 * @fileOverview A centralized flow for translating structured content using Genkit.
 *
 * - translateContent - Handles translating a record of strings to a target language.
 * - TranslateContentInput - The Zod schema for the flow's input.
 * - TranslateContentOutput - The Zod schema for the flow's output.
 */

import { z } from 'zod';
import { defineFlow } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

// Schema for the translation input
export const TranslateContentInputSchema = z.object({
  contentToTranslate: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

// Schema for the translation output
export const TranslateContentOutputSchema = z.record(z.string());
export type TranslateContentOutput = z.infer<
  typeof TranslateContentOutputSchema
>;

export const translateContentFlow = defineFlow(
  {
    name: 'translateContentFlow',
    inputSchema: TranslateContentInputSchema,
    outputSchema: TranslateContentOutputSchema,
  },
  async (input: TranslateContentInput) => {
    const {contentToTranslate, targetLanguage} = input;

    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
    const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(
      contentToTranslate
    )}`;

    const { output } = await googleAI.generate({
      model: 'googleai/gemini-1.5-flash-latest',
      system: systemInstruction,
      prompt: prompt,
      output: {
        format: 'json',
        schema: TranslateContentOutputSchema,
      },
    });

    if (!output || typeof output !== 'object') {
      throw new Error(
        'AI returned a non-object or empty response for translation.'
      );
    }

    return output;
  }
);
