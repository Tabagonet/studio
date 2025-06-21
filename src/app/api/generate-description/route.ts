
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { z } from 'zod';

// --- SELF-CONTAINED AI LOGIC ---
// By co-locating all Genkit logic here, we avoid Next.js module resolution issues.

// 1. Initialize Genkit
// This instance is created only when the API route is invoked.
const ai = genkit({
  plugins: [googleAI()],
  enableTelemetry: false,
});

// 2. Define Zod Schemas for Input and Output
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().describe('The name of the product.'),
  productType: z.string().describe('The type of product (e.g., simple, variable).'),
  keywords: z.string().describe('A comma-separated list of keywords related to the product.'),
});
type GenerateProductDescriptionInput = z.infer<typeof GenerateProductDescriptionInputSchema>;

const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, including its features, benefits, and uses. Format it with paragraphs for readability.'),
});

// 3. Define the Genkit Prompt
const productDescriptionPrompt = ai.definePrompt({
  name: 'productDescriptionPrompt_api_route',
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

// 4. Define the Genkit Flow
const generateProductDescriptionFlow = ai.defineFlow(
  {
    name: 'generateProductDescriptionFlow_api_route',
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


// --- API ROUTE HANDLER ---

export async function POST(req: NextRequest) {
  // A. Fast fail if GOOGLE_API_KEY is not set.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('CRITICAL: GOOGLE_API_KEY environment variable is not set.');
    return NextResponse.json(
      { 
        error: 'Error de Configuración del Servidor',
        message: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // B. Authenticate the user.
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.', message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  // C. Process the request.
  try {
    const body = await req.json();

    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', message: 'Los datos enviados no tienen el formato correcto.', details: validatedBody.error.format() }, { status: 400 });
    }

    // Call the self-contained flow.
    const descriptions = await generateProductDescriptionFlow(validatedBody.data);
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    console.error('--- FULL ERROR in /api/generate-description POST handler ---');
    console.error(error);
    console.error('--- END OF FULL ERROR ---');
    
    const errorMessage = error.cause?.root?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';

    return NextResponse.json(
      {
        error: 'Error al comunicarse con la IA',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
