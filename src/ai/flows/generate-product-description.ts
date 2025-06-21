
'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating product descriptions.
 * It is self-contained and initializes its own Genkit instance to avoid module resolution issues.
 *
 * It exports:
 * - generateProductDescription: An async function to be used as a Server Action.
 * - GenerateProductDescriptionInput: The TypeScript type for the input.
 * - GenerateProductDescriptionOutput: The TypeScript type for the output.
 */

// Use namespace import as a last resort to solve potential bundling issues with Next.js
import * as genkitCore from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

// --- Genkit Initialization (Self-contained) ---
// We initialize Genkit here to prevent Next.js module resolution issues
// that occur when importing a shared instance into a Server Action file.
const ai = genkitCore.genkit({ // Use the function from the namespace
  plugins: [googleAI()],
});

// --- Zod Schemas (Internal to this file) ---

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


// --- Genkit Prompt Definition (Internal) ---

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


// --- Genkit Flow Definition (Internal) ---

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


// --- Exported Server Action ---

/**
 * Generates product descriptions using an AI model.
 * This function is a wrapper around the Genkit flow and is safe to be used as a Server Action.
 * @param input - The product data to generate descriptions for.
 * @returns A promise that resolves to the generated short and long descriptions.
 */
export async function generateProductDescription(input: GenerateProductDescriptionInput): Promise<GenerateProductDescriptionOutput> {
  return generateProductDescriptionFlow(input);
}
