
'use server';

import { defineFlow, z } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export const TranslateContentInputSchema = z.object({
  contentToTranslate: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

const translateContentFlow = defineFlow(
  {
    name: 'translateContentFlow',
    inputSchema: TranslateContentInputSchema,
    outputSchema: z.record(z.string()),
  },
  async ({ contentToTranslate, targetLanguage }) => {
    const { generate } = await import('@genkit-ai/ai');

    const systemInstruction = `You are an expert translator. Translate the values of the user-provided JSON object into the specified target language. It is crucial that you maintain the original JSON structure and keys. You must also preserve all HTML tags (e.g., <h2>, <p>, <strong>) and special separators like '|||' in their correct positions within the string values. Your output must be only the translated JSON object, without any extra text, comments, or markdown formatting.`;
    const prompt = `Translate the following content to ${targetLanguage}:\n\n${JSON.stringify(contentToTranslate)}`;
    const outputSchema = z.record(z.string());

    const { output } = await generate({
      model: googleAI('gemini-1.5-flash-latest'),
      system: systemInstruction,
      prompt: prompt,
      output: {
        format: 'json',
        schema: outputSchema,
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

// Exported wrapper function
export async function translateContent(input: TranslateContentInput): Promise<Record<string, string>> {
    const { runFlow } = await import('@genkit-ai/core');
    return runFlow(translateContentFlow, input);
}
