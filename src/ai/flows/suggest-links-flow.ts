'use server';
/**
 * @fileOverview An AI flow for suggesting internal links within content.
 */
import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { 
    type SuggestLinksOutput, 
    SuggestLinksOutputSchema 
} from '@/ai/schemas';

const suggestInternalLinksFlow = ai.defineFlow(
  {
    name: 'suggestInternalLinksFlow',
    inputSchema: z.string(), // The prompt string
    outputSchema: SuggestLinksOutputSchema,
  },
  async (prompt) => {
    const { output } = await ai.generate({
        model: 'googleai/gemini-1.5-flash-latest',
        prompt: prompt,
        output: { schema: SuggestLinksOutputSchema },
    });
    return output!;
  }
);

export async function suggestInternalLinks(prompt: string): Promise<SuggestLinksOutput> {
  const result = await suggestInternalLinksFlow(prompt);
  return SuggestLinksOutputSchema.parse(result);
}
