
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

// --- Type Imports Only ---
// We only import the Zod schemas and TypeScript types here.
// The actual AI logic will be dynamically imported inside the POST handler.
import {
  GenerateProductDescriptionInputSchema,
  GenerateProductDescriptionOutputSchema,
  type GenerateProductDescriptionInput,
} from '@/ai/flows/generate-product-description';


export async function POST(req: NextRequest) {
  console.log('--- /api/generate-description: POST request received ---');

  // 1. Fast fail if the Google AI API Key is not configured on the server.
  if (!process.env.GOOGLE_API_KEY) {
    const errorMsg = 'CRITICAL: GOOGLE_API_KEY environment variable is not set.';
    console.error(`/api/generate-description: ${errorMsg}`);
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
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
    console.log('/api/generate-description: User authenticated successfully.');
  } catch (error) {
    console.error("/api/generate-description: Error verifying Firebase token:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.', message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  // 3. Process the request by dynamically importing and calling the AI flow.
  try {
    console.log('/api/generate-description: Parsing request body...');
    const body: GenerateProductDescriptionInput = await req.json();
    console.log('/api/generate-description: Request body parsed successfully:', body);

    // --- DYNAMIC IMPORT & SELF-CONTAINED AI LOGIC ---
    console.log('/api/generate-description: Dynamically importing Genkit and Google AI plugin...');
    const { genkit, type GenkitError } = await import('@genkit-ai/core');
    const { googleAI } = await import('@genkit-ai/googleai');
    console.log('/api/generate-description: Dynamic imports successful.');

    // Check if `genkit` is actually a function before calling it.
    if (typeof genkit !== 'function') {
      const errorMsg = `CRITICAL: The imported 'genkit' is not a function. Type is: ${typeof genkit}`;
      console.error(errorMsg);
      // Throw a specific error that will be caught and returned as JSON
      throw new Error(errorMsg);
    }
    
    console.log('/api/generate-description: Initializing Genkit instance...');
    const ai = genkit({
      plugins: [googleAI()],
      enableTelemetry: false,
    });
    console.log('/api/generate-description: Genkit instance initialized.');

    console.log('/api/generate-description: Defining prompt...');
    const productDescriptionPrompt = ai.definePrompt({
      name: 'productDescriptionPrompt_api_dynamic', // Use a unique name
      input: { schema: GenerateProductDescriptionInputSchema },
      output: { schema: GenerateProductDescriptionOutputSchema },
      prompt: `
        You are an expert e-commerce copywriter and SEO specialist.
        Your task is to generate compelling and optimized product descriptions for a WooCommerce store.
        The response must be in Spanish.

        **Product Information:**
        - **Name:** {{{productName}}}
        - **Type:** {{{productType}}}
        {{#if keywords}}
        - **Keywords:** {{{keywords}}}
        {{/if}}

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
    console.log('/api/generate-description: Prompt defined. Executing prompt...');

    const { output } = await productDescriptionPrompt(body);
    
    if (!output) {
      throw new Error('AI model returned an empty output.');
    }

    console.log('/api/generate-description: Prompt executed successfully. Sending response.');
    return NextResponse.json(output);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description POST handler ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    
    // Check if it's a GenkitError for more details
    if ('isGenkitError' in error && error.isGenkitError) {
      const genkitError = error as GenkitError;
      console.error('Genkit Error Root Cause:', genkitError.cause);
      console.error('Genkit Error Details:', genkitError.details);
    }
    
    // Ensure a JSON response is always sent, even on failure.
    const errorMessage = error.cause?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json(
      {
        error: 'Error Interno del Servidor',
        message: `Ocurrió un error en el servidor. Revisa los logs para más detalles. Mensaje: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
