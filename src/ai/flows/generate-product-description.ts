
import { z } from 'zod';

// This file now ONLY defines the Zod schemas and their corresponding TypeScript types.
// It contains NO executable code or 'use server' directives to prevent module conflicts.

// Define the input schema for the AI generation.
export const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().optional().describe('A comma-separated list of keywords related to the product.'),
});
export type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;


// Define the output schema for the AI generation. This ensures the AI returns data in a structured format.
export const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences), in Spanish.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability, in Spanish.'),
});
export type GenerateProductDescriptionOutput = z.infer<typeof GenerateProductDescriptionOutputSchema>;
