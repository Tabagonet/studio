// src/app/api/generate-description/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

// AI-related imports are now self-contained within this file.
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

// Define Zod Schemas for input and output directly in this file.
// This is used for both validation and for guiding the AI model.
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().optional().describe('A comma-separated list of keywords related to the product.'),
});

const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});

// This is the main API route handler.
export async function POST(req: NextRequest) {
  console.log('/api/generate-description: POST request received.');

  // 1. Fast fail if the Google AI API Key is not configured on the server.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('/api/generate-description: CRITICAL: GOOGLE_API_KEY environment variable is not set.');
    return NextResponse.json(
      { 
        error: 'Error de Configuración del Servidor',
        message: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // 2. Authenticate the user via Firebase Admin SDK.
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    console.error('/api/generate-description: Authentication token not provided.');
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
    console.log('/api/generate-description: User authenticated successfully.');
  } catch (error) {
    console.error("/api/generate-description: Error verifying Firebase token:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.', message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  // 3. Process the request.
  try {
    const body = await req.json();
    console.log('/api/generate-description: Request body parsed.');

    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      console.error('/api/generate-description: Invalid request body:', validatedBody.error.format());
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', message: 'Los datos enviados no tienen el formato correcto.', details: validatedBody.error.format() }, { status: 400 });
    }
    
    console.log('/api/generate-description: Request body validated. Initializing Genkit and defining prompt...');

    // Initialize Genkit. This happens on each request to be robust against hot-reloading issues.
    const ai = genkit({
      plugins: [googleAI()],
      enableTelemetry: false,
    });

    // Define the prompt object.
    const productDescriptionPrompt = ai.definePrompt({
      name: 'productDescriptionPrompt_in_api_route',
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
    
    console.log('/api/generate-description: Prompt defined. Calling the AI model...');
    
    // Call the AI model via the prompt.
    const { output } = await productDescriptionPrompt(validatedBody.data);
    
    if (!output) {
      throw new Error('AI failed to generate a description. The model returned an empty output.');
    }
    
    console.log('/api/generate-description: AI model returned a response. Sending to client.');
    return NextResponse.json(output);

  } catch (error: any) {
    // This is the most important log. It will capture the error before Next.js hides it.
    console.error('--- CRITICAL ERROR in /api/generate-description POST handler ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    if (error.cause) {
        console.error('Error Cause:', error.cause);
    }
    console.error('--- END OF CRITICAL ERROR ---');
    
    const errorMessage = error.cause?.root?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json(
      {
        error: 'Error Interno del Servidor',
        message: `Ocurrió un error en el servidor. Revisa los logs para más detalles. Mensaje: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
