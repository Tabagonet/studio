
'use server';

/**
 * @fileOverview Defines a server action for generating product descriptions using Genkit and Google AI.
 * This file encapsulates all the logic for the AI flow, including schema definitions,
 * prompt creation, and the main generation function.
 *
 * - generateProductDescription - The main exported function to be called by API routes.
 * - GenerateProductDescriptionInputSchema - The Zod schema for the input.
 * - GenerateProductDescriptionOutputSchema - The Zod schema for the output.
 */

import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

// --- Zod Schemas ---
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().describe('A comma-separated list of keywords related to the product.'),
});
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;

export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


// --- Genkit Initialization and Flow ---

// This pattern prevents Next.js from re-initializing Genkit on every hot-reload in development.
// It stores the instance in a global variable, which persists across reloads.
declare global {
  var __genkit_ai_instance: any;
}

const getGenkitInstance = () => {
  if (!global.__genkit_ai_instance) {
    console.log('Initializing new Genkit instance...');
    global.__genkit_ai_instance = genkit({
      plugins: [googleAI()],
      enableTelemetry: false,
      logLevel: 'silent',
    });
  }
  return global.__genkit_ai_instance;
};

const ai = getGenkitInstance();

// Define the prompt at the top level of the module.
const productDescriptionPrompt = ai.definePrompt({
  name: 'productDescriptionPrompt_v5_singleton',
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

// Define the flow at the top level of the module.
const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlowSingleton',
    inputSchema: GenerateProductDescriptionInputSchema,
    outputSchema: GenerateProductDescriptionOutputSchema,
  },
  async (input) => {
    const { output } = await productDescriptionPrompt(input);
    if (!output) {
      throw new Error('AI failed to generate a description. The model returned an empty output.');
    }
    return output;
  }
);

/**
 * Main exported function to generate product descriptions.
 * This is the entry point that will be called by the API route.
 * @param input The product data conforming to GenerateProductDescriptionInputSchema.
 * @returns A promise that resolves to the generated descriptions.
 */
export async function generateProductDescription(input: GenerateProductDescriptionInput): Promise<GenerateProductDescriptionOutput> {
  return generateProductDescriptionFlow(input);
}
