
'use server';

import { z } from 'zod';

// This file now only defines the types for the AI flow.
// The actual implementation has been moved to the API route to prevent build issues.

// Define the input schema for the flow.
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().optional().describe('A comma-separated list of keywords related to the product.'),
});
// Export the type for use in other parts of the application (e.g., API route).
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;


// Define the output schema for the flow. This ensures the AI returns data in a structured format.
export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});
// Export the type for use in other parts of theapplication.
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;


// The actual flow function has been moved to the API route at
// /src/app/api/generate-description/route.ts
// to be self-contained and avoid Next.js module resolution conflicts during development.
export async function generateProductDescription(
    input: GenerateProductDescriptionInput
): Promise<GenerateProductDescriptionOutput> {
    throw new Error("This function is deprecated. The implementation was moved to the API route.");
}
