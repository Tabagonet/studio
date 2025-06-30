
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';

// Direct import and initialization of Genkit to solve Next.js bundling issues.
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
const ai = genkit({
  plugins: [googleAI()],
});


// Schemas and types are now internal to this file (no 'export' keyword).
const GenerateProductInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
  groupedProductIds: z.array(z.number()).optional(),
  uid: z.string(), // This will be added on the server
});
type GenerateProductInput = z.infer<typeof GenerateProductInputSchema>;

const GenerateProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});
type GenerateProductOutput = z.infer<typeof GenerateProductOutputSchema>;


// The core Genkit flow logic now lives inside this helper function
async function runProductGenerationFlow(input: GenerateProductInput): Promise<GenerateProductOutput> {
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
              const stripHtml = (html: string | null | undefined): string => html ? html.replace(/<[^>]*>?/gm, '') : '';
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
    
    const generateProductPrompt = ai.definePrompt(
      {
        name: 'generateProductPromptInRoute',
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

    const { output } = await generateProductPrompt({ ...input, groupedProductsList });
    if (!output) {
      throw new Error('AI returned an empty response.');
    }

    return output;
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
     return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clientInputSchema = GenerateProductInputSchema.omit({ uid: true });
    const validationResult = clientInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const inputData = validationResult.data;
    
    const flowInput = { ...inputData, uid };
    
    const generatedContent = await runProductGenerationFlow(flowInput);
    
    return NextResponse.json(generatedContent);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description ---', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ error: 'Error Interno del Servidor', message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}` }, { status: 500 });
  }
}
