
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating product descriptions.
 * It uses a direct, module-level initialization of Genkit, which is the standard
 * and most stable approach when called from a server-side context like an API route.
 *
 * It exports:
 * - generateProductDescription: An async function to be used by the API route.
 * - GenerateProductDescriptionInput: The TypeScript type for the input.
 * - GenerateProductDescriptionOutput: The TypeScript type for the output.
 */

import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

// --- Direct Initialization (Module Level) ---
// This is the standard and most robust way to initialize Genkit.
const ai = genkit({
    plugins: [googleAI()],
});


// --- Zod Schemas ---
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().describe('A comma-separated list of keywords related to the product.'),
});

const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});

// --- Exported TypeScript Types ---
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


// --- Genkit Prompt and Flow Definition ---

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

const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlow',
    inputSchema: GenerateProductDescriptionInputSchema,
    outputSchema: GenerateProductDescriptionOutputSchema,
  },
  async (input) => {
    const { output } = await productDescriptionPrompt(input);
    if (!output) {
      throw new Error('AI failed to generate a description.');
    }
    return output;
  }
);

/**
 * The main exported function that wraps the Genkit flow.
 * This is called by the API route.
 * @param input - The product data to generate descriptions for.
 * @returns A promise that resolves to the generated short and long descriptions.
 */
export async function generateProductDescription(input: GenerateProductDescriptionInput): Promise<GenerateProductDescriptionOutput> {
  return generateProductDescriptionFlow(input);
}
