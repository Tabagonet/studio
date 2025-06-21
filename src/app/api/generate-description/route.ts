
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import * as genkitCore from '@genkit-ai/core';
import * as googleAIPlugin from '@genkit-ai/googleai';

// Declare a global variable to hold the AI instance for robust singleton pattern in Next.js
declare global {
  var genkitAiInstance: any;
}

const { z } = genkitCore;

// --- Zod Schemas ---
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().describe('A comma-separated list of keywords related to the product.'),
});

const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});

// --- Genkit Initialization and Flow (Self-contained & Robust) ---

// Use a singleton pattern compatible with Next.js hot-reloading and serverless environments.
function getAi() {
  if (globalThis.genkitAiInstance) {
    return globalThis.genkitAiInstance;
  }

  console.log("Initializing Genkit for the first time in this instance...");
  
  globalThis.genkitAiInstance = genkitCore.genkit({
    plugins: [
      googleAIPlugin.googleAI({
        // The API key is passed automatically from the GOOGLE_API_KEY environment variable.
      }),
    ],
  });

  return globalThis.genkitAiInstance;
}

async function runGenerateDescriptionFlow(input: z.infer<typeof GenerateProductDescriptionInputSchema>): Promise<z.infer<typeof GenerateProductDescriptionOutputSchema>> {
  const ai = getAi();

  const productDescriptionPrompt = ai.definePrompt({
    name: 'productDescriptionPrompt_v3', // new name to avoid potential cache conflicts
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

  const { output } = await productDescriptionPrompt(input);
  if (!output) {
    throw new Error('AI failed to generate a description. The model returned an empty output.');
  }
  return output;
}


// --- API Route Handler ---

export async function POST(req: NextRequest) {
  // 1. Check for API Key first for a better error message
  if (!process.env.GOOGLE_API_KEY) {
    console.error('CRITICAL: GOOGLE_API_KEY environment variable is not set.');
    return NextResponse.json(
      { 
        error: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // 2. Authenticate the user
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.' }, { status: 401 });
  }

  // 3. Process the request
  try {
    const body = await req.json();

    // Validate input against the local Zod schema
    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', details: validatedBody.error.format() }, { status: 400 });
    }

    // Call the self-contained Genkit flow
    const descriptions = await runGenerateDescriptionFlow(validatedBody.data);
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    console.error('--- FULL ERROR in /api/generate-description ---');
    // Log the full object for better server-side debugging
    console.error(error);
    console.error('--- END OF FULL ERROR ---');

    let errorMessage = 'Ocurrió un error desconocido al generar la descripción.';
    
    // Try to extract a more specific error message from nested error objects, which are common in API clients
    if (error.cause?.root?.message) {
      errorMessage = `La API de IA devolvió un error: ${error.cause.root.message}`;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      {
        error: 'Error al comunicarse con la IA',
        message: errorMessage,
        // Only include stack trace in development for security reasons
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
