'use server';
/**
 * @fileOverview An AI flow to generate comprehensive product details for e-commerce.
 *
 * - generateProductFlow - A function that takes product details and generates descriptions, SEO data, and more.
 * - GenerateProductInputSchema - The Zod schema for the flow's input.
 * - GenerateProductOutputSchema - The Zod schema for the flow's output.
 */

import { ai } from '@/ai/genkit';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

export const GenerateProductInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
  groupedProductIds: z.array(z.number()).optional(),
  uid: z.string(),
});
export type GenerateProductInput = z.infer<typeof GenerateProductInputSchema>;

export const GenerateProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});
export type GenerateProductOutput = z.infer<typeof GenerateProductOutputSchema>;


const stripHtml = (html: string | null | undefined): string => {
    return html ? html.replace(/<[^>]*>?/gm, '') : '';
};

// This is the wrapper function that will be called by the API
export async function generateProductFlow(input: GenerateProductInput): Promise<GenerateProductOutput> {
  return generateProductFlowInternal(input);
}


const generateProductPrompt = ai.definePrompt(
  {
    name: 'generateProductPrompt',
    // We'll define a custom input schema for the prompt that includes the fetched product list
    input: { schema: GenerateProductInputSchema.extend({ groupedProductsList: z.string() }) },
    output: { schema: GenerateProductOutputSchema },
    prompt: `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a single, valid JSON object that conforms to the output schema. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{{productName}}}
- **Language for output:** {{{language}}}
- **Product Type:** {{{productType}}}
- **User-provided Keywords (for inspiration):** {{{keywords}}}
- **Contained Products (for "Grouped" type only):**
{{{groupedProductsList}}}

Generate the complete JSON object based on your research of "{{{productName}}}".`,
  },
);


// Renamed to Internal and defined as a Genkit flow
const generateProductFlowInternal = ai.defineFlow(
  {
    name: 'generateProductFlow',
    inputSchema: GenerateProductInputSchema,
    outputSchema: GenerateProductOutputSchema,
  },
  async (input: GenerateProductInput) => {
    let groupedProductsList = 'N/A';
    if (input.productType === 'grouped' && input.groupedProductIds && input.groupedProductIds.length > 0) {
        const { wooApi } = await getApiClientsForUser(input.uid);
        if (!wooApi) {
            throw new Error("WooCommerce API is not configured. Cannot fetch grouped product details.");
        }
        try {
          const response = await wooApi.get("products", { include: input.groupedProductIds, per_page: 100 });
          if (response.data && response.data.length > 0) {
            groupedProductsList = response.data.map((product: any) => {
              const name = product.name;
              const desc = stripHtml(product.short_description) || stripHtml(product.description)?.substring(0, 150) + '...' || 'No description available.';
              return `* Product: ${name}\n* Details: ${desc}`;
            }).join('\n\n');
          }
        } catch (e) {
          console.error("Failed to fetch details for grouped products:", e);
          groupedProductsList = 'Error fetching product details.';
        }
    }
    
    // Pass the fetched data along with the original input to the prompt
    const { output } = await generateProductPrompt({ ...input, groupedProductsList });
    if (!output) {
      throw new Error('AI returned an empty response.');
    }

    return output;
  }
);
