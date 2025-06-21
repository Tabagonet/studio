
'use server';

// This file defines the AI flow for generating product descriptions.
// It is designed to be self-contained and easily callable.

import { ai } from '@genkit-ai/core'; // Import the default ai object
import { z } from 'zod';
import '../genkit'; // Import for side-effects to run configureGenkit

// Define the input schema for the flow.
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().optional().describe('A comma-separated list of keywords related to the product.'),
});
// Export the type for use in other parts of the application (e.g., API route).
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;


// Define the output schema for the flow. This ensures the AI returns data in a structured format.
const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});
// Export the type for use in other parts of the application.
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


// Define the prompt that will be sent to the AI model.
const productDescriptionPrompt = ai.definePrompt({
  name: 'productDescriptionPrompt',
  input: { schema: GenerateProductDescriptionInputSchema },
  output: { schema: GenerateProductDescriptionOutputSchema },
  prompt: `
    You are an expert e-commerce copywriter and SEO specialist.
    Your task is to generate compelling and optimized product descriptions for a WooCommerce store.
    The response must be in Spanish.

    **Product Information:**
    - **Name:** {{{productName}}}
    - **Type:** {{{productType}}}
    - **Keywords:** {{{keywords}}}

    **Instructions:**
    1.  **Short Description:** Write a concise and engaging summary in Spanish. This should immediately grab the customer's attention and is crucial for search result snippets.
    2.  **Long Description:** Write a detailed and persuasive description in Spanish.
        - Start with an enticing opening.
        - Elaborate on the features and, more importantly, the benefits for the customer.
        - Use the provided keywords naturally throughout the text to improve SEO.
        - Structure the description with clear paragraphs. Avoid long walls of text.
        - Maintain a professional but approachable tone.

    Generate the descriptions based on the provided information.
  `,
});
    
// Define the flow, which orchestrates the call to the prompt.
const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlow',
    inputSchema: GenerateProductDescriptionInputSchema,
    outputSchema: GenerateProductDescriptionOutputSchema,
  },
  async (input) => {
    console.log('[AI Flow] generateProductDescriptionFlow: Received input:', input);
    
    console.log('[AI Flow] generateProductDescriptionFlow: Calling prompt...');
    const { output } = await productDescriptionPrompt(input);
    
    if (!output) {
      throw new Error('AI model returned an empty output.');
    }
    
    console.log('[AI Flow] generateProductDescriptionFlow: Received output from AI.');
    return output;
  }
);


// Exported wrapper function to be called from the API route.
export async function generateProductDescription(
    input: GenerateProductDescriptionInput
): Promise<GenerateProductDescriptionOutput> {
    return await generateProductDescriptionFlow(input);
}
