
'use server';
/**
 * @fileOverview A Genkit flow for generating comprehensive product descriptions.
 * This flow takes basic product info and generates SEO-optimized content.
 */
import { defineFlow, z } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import Handlebars from 'handlebars';

// Define input schema with Zod for validation
export const GenerateProductInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
  groupedProductsList: z.string().optional(),
  uid: z.string(), // Keep UID for context if needed, but not used in prompt
});
export type GenerateProductInput = z.infer<typeof GenerateProductInputSchema>;


// Define output schema with Zod for structured output
export const GenerateProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});
export type GenerateProductOutput = z.infer<typeof GenerateProductOutputSchema>;


// Define the prompt template
const generateProductPromptTemplate = `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a single, valid JSON object that conforms to the output schema. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):**
{{{groupedProductsList}}}

Generate the complete JSON object based on your research of "{{productName}}".`;


// Define the flow
const generateProductFlow = defineFlow(
  {
    name: 'generateProductFlow',
    inputSchema: GenerateProductInputSchema,
    outputSchema: GenerateProductOutputSchema,
  },
  async (input) => {
    const { generate } = await import('@genkit-ai/ai');

    const template = Handlebars.compile(generateProductPromptTemplate, { noEscape: true });
    const finalPrompt = template(input);
    
    const { output } = await generate({
      model: googleAI('gemini-1.5-flash-latest'),
      prompt: finalPrompt,
      output: {
        schema: GenerateProductOutputSchema
      }
    });

    if (!output) {
      throw new Error('AI returned an empty response.');
    }
    return output;
  }
);


// Exported wrapper function to be called from API routes
export async function generateProduct(input: GenerateProductInput): Promise<GenerateProductOutput> {
    const { runFlow } = await import('@genkit-ai/core');
    return runFlow(generateProductFlow, input);
}
