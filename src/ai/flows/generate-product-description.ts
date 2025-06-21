
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating product descriptions.
 *
 * - generateProductDescription: An exported function to trigger the description generation.
 * - GenerateProductDescriptionInputSchema: The Zod schema for the input data.
 * - GenerateProductDescriptionOutputSchema: The Zod schema for the AI's output.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import type { ProductType } from '@/lib/types';

// Define the schema for the data we'll provide to the AI
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().describe('A comma-separated list of keywords related to the product.'),
});

// Define the schema for the data we expect the AI to return
export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});

// Define types based on our Zod schemas
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


// Define the AI prompt using Handlebars templating
const productDescriptionPrompt = ai.definePrompt({
  name: 'productDescriptionPrompt',
  input: { schema: GenerateProductDescriptionInputSchema },
  output: { schema: GenerateProductDescriptionOutputSchema },
  prompt: `
    You are an expert e-commerce copywriter and SEO specialist.
    Your task is to generate compelling and optimized product descriptions for a WooCommerce store.

    **Product Information:**
    - **Name:** {{{productName}}}
    - **Type:** {{{productType}}}
    - **Keywords:** {{{keywords}}}

    **Instructions:**
    1.  **Short Description:** Write a concise and engaging summary. This should immediately grab the customer's attention and is crucial for search result snippets.
    2.  **Long Description:** Write a detailed and persuasive description.
        - Start with an enticing opening.
        - Elaborate on the features and, more importantly, the benefits for the customer.
        - Use the provided keywords naturally throughout the text to improve SEO.
        - Structure the description with clear paragraphs. Avoid long walls of text.
        - Maintain a professional but approachable tone.

    Generate the descriptions based on the provided information.
  `,
});


// Define the Genkit flow
const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlow',
    inputSchema: GenerateProductDescriptionInputSchema,
    outputSchema: GenerateProductDescriptionOutputSchema,
  },
  async (input) => {
    // Call the prompt with the validated input
    const { output } = await productDescriptionPrompt(input);
    
    // Ensure output is not null before returning
    if (!output) {
      throw new Error('AI failed to generate a description.');
    }
    
    return output;
  }
);


// Export a simple async function to be used as a Server Action in our components
export async function generateProductDescription(input: GenerateProductDescriptionInput): Promise<GenerateProductDescriptionOutput> {
  return generateProductDescriptionFlow(input);
}
