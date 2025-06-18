
'use server';
/**
 * @fileOverview A Genkit flow for generating product descriptions using AI.
 *
 * - generateProductDescription - A function that handles the product description generation process.
 * - GenerateProductDescriptionInput - The input type for the generateProductDescription function.
 * - GenerateProductDescriptionOutput - The return type for the generateProductDescription function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import type { GenerateProductDescriptionInput, GenerateProductDescriptionOutput } from '@/lib/types';

const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  categoryName: z.string().optional().describe('The name of the product category (e.g., "Ropa", "Plantas Suculentas").'),
  keywords: z.string().optional().describe('Comma-separated keywords relevant to the product (e.g., "drought-tolerant, xeriscaping, modern garden").'),
  attributesSummary: z.string().optional().describe('A summary of product attributes (e.g., "Color: Blue-green, Form: Rosette, Maintenance: Low").'),
});

const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().optional().describe('A concise short description, suitable for product previews (2-3 sentences, ~160 characters).'),
  longDescription: z.string().optional().describe('A detailed long description, providing more in-depth information (2-3 paragraphs).'),
});

export async function generateProductDescription(
  input: GenerateProductDescriptionInput
): Promise<GenerateProductDescriptionOutput> {
  return generateProductDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateProductDescriptionPrompt',
  input: { schema: GenerateProductDescriptionInputSchema },
  output: { schema: GenerateProductDescriptionOutputSchema },
  prompt: `You are an expert e-commerce copywriter. Your task is to generate compelling product descriptions.

Given the following product details:
Product Name: {{{productName}}}
{{#if categoryName}}Category: {{{categoryName}}}{{/if}}
{{#if keywords}}Keywords: {{{keywords}}}{{/if}}
{{#if attributesSummary}}Key Attributes: {{{attributesSummary}}}{{/if}}

Please generate the following, keeping a professional and engaging tone:

1.  **Short Description:**
    *   Length: Approximately 2-3 sentences, aiming for a maximum of 160-200 characters.
    *   Content: Highlight the main selling points and unique appeal. Make it concise and persuasive.
    *   Example for 'AGAVE AVELLANIDENS' (Keywords: drought-tolerant, succulent, Baja California, xeriscaping, modern garden; Attributes: Broad blue-green leaves, Bold rosette form):
        'Agave avellanidens is a striking, drought-tolerant succulent native to Baja California. With its broad blue-green leaves and bold rosette form, it’s perfect for xeriscaping and modern dry-climate gardens. Low-maintenance and pollinator-friendly, it adds structure and resilience to any landscape.'

2.  **Long Description:**
    *   Length: Approximately 2-4 paragraphs.
    *   Content: Provide more detailed information about the product. Expand on its features, benefits, potential uses, or care instructions if relevant from the input. 
    *   Tone: Enthusiastic, knowledgeable, and trustworthy.

Focus on the unique aspects of "{{{productName}}}".
If keywords or attributes suggest specific uses (e.g., "indoor", "fruit-bearing", "shade-loving", "for beginners"), try to incorporate those into the descriptions naturally.
Ensure the descriptions are well-written, grammatically correct, and ready for an e-commerce website.
Do not include the placeholders (like "{{{productName}}}") in your final output.
Output ONLY the JSON structure defined in the output schema.
`,
});

const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlow',
    inputSchema: GenerateProductDescriptionInputSchema,
    outputSchema: GenerateProductDescriptionOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
        console.warn("[AI Description Flow] LLM did not return an output for input:", input);
        return { shortDescription: undefined, longDescription: undefined };
    }
    // Ensure undefined if empty strings are returned, to allow fallbacks
    return {
        shortDescription: output.shortDescription?.trim() || undefined,
        longDescription: output.longDescription?.trim() || undefined,
    };
  }
);
