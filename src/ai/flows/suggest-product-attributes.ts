'use server';

/**
 * @fileOverview This file defines a Genkit flow for suggesting product attributes based on keywords.
 *
 * The flow takes product keywords as input and returns a list of suggested attributes.
 * - suggestProductAttributes - A function that handles the product attribute suggestion process.
 * - SuggestProductAttributesInput - The input type for the suggestProductAttributes function.
 * - SuggestProductAttributesOutput - The return type for the suggestProductAttributes function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestProductAttributesInputSchema = z.object({
  keywords: z
    .string()
    .describe('Keywords describing the product, separated by commas.'),
});
export type SuggestProductAttributesInput = z.infer<
  typeof SuggestProductAttributesInputSchema
>;

const SuggestProductAttributesOutputSchema = z.object({
  attributes: z
    .array(z.string())
    .describe('A list of suggested attributes for the product.'),
});
export type SuggestProductAttributesOutput = z.infer<
  typeof SuggestProductAttributesOutputSchema
>;

export async function suggestProductAttributes(
  input: SuggestProductAttributesInput
): Promise<SuggestProductAttributesOutput> {
  return suggestProductAttributesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestProductAttributesPrompt',
  input: {schema: SuggestProductAttributesInputSchema},
  output: {schema: SuggestProductAttributesOutputSchema},
  prompt: `You are an expert in product attributes for e-commerce.

  Based on the following keywords, suggest a list of attributes that would be relevant for the product.
  The attributes should be specific and descriptive.
  Return the attributes as a simple list of strings.

  Keywords: {{{keywords}}}
  `,
});

const suggestProductAttributesFlow = ai.defineFlow(
  {
    name: 'suggestProductAttributesFlow',
    inputSchema: SuggestProductAttributesInputSchema,
    outputSchema: SuggestProductAttributesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
