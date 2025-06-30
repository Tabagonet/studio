
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import * as genkit from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { getApiClientsForUser } from '@/lib/api-helpers';
import Handlebars from 'handlebars';

// Schemas for input and output, defined directly in the route
const GenerateProductInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z
    .enum(['Spanish', 'English', 'French', 'German', 'Portuguese'])
    .default('Spanish'),
  groupedProductsList: z.string(), // Added for the prompt template
});

const GenerateProductOutputSchema = z.object({
  shortDescription: z
    .string()
    .describe(
      'A brief, catchy, and SEO-friendly summary of the product (1-2 sentences). Must use HTML for formatting.'
    ),
  longDescription: z
    .string()
    .describe(
      'A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'
    ),
  keywords: z
    .string()
    .describe(
      'A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'
    ),
  imageTitle: z
    .string()
    .describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z
    .string()
    .describe(
      'A descriptive alt text for SEO, describing the image for visually impaired users.'
    ),
  imageCaption: z
    .string()
    .describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z
    .string()
    .describe('A detailed description for the image media library entry.'),
});

// Prompt template, defined directly in the route
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
    
    // Schema for validating client input (doesn't include server-added fields)
    const ClientInputSchema = z.object({
        productName: z.string().min(1),
        productType: z.string(),
        keywords: z.string().optional(),
        language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
        groupedProductIds: z.array(z.number()).optional(),
    });

    const validationResult = ClientInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const clientInput = validationResult.data;
    
    let groupedProductsList = 'N/A';
    if (clientInput.productType === 'grouped' && clientInput.groupedProductIds && clientInput.groupedProductIds.length > 0) {
        const { wooApi } = await getApiClientsForUser(uid);
        if (wooApi) {
             try {
                const response = await wooApi.get('products', { include: clientInput.groupedProductIds, per_page: 100, lang: 'all' });
                if (response.data && response.data.length > 0) {
                    groupedProductsList = response.data.map((p: any) => `* Product: ${p.name}\\n* Details: ${p.short_description || p.description || 'No description'}`).join('\\n\\n');
                }
            } catch (e) {
                console.error('Failed to fetch details for grouped products:', e);
                groupedProductsList = 'Error fetching product details.';
            }
        }
    }
    
    const template = Handlebars.compile(generateProductPromptTemplate, { noEscape: true });
    const finalPrompt = template({ ...clientInput, groupedProductsList });

    const { output } = await genkit.generate({
        model: googleAI('gemini-1.5-flash-latest'),
        prompt: finalPrompt,
        output: { schema: GenerateProductOutputSchema }
    });

    if (!output) {
      throw new Error('AI returned an empty response.');
    }
    
    return NextResponse.json(output);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
     if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'La IA falló: ' + errorMessage }, { status: 500 });
  }
}
