
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

// Define input schema for validation
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English']).default('Spanish'),
});

// Define output schema for creating the JSON prompt and for parsing
const GenerateProductDescriptionOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, following a specific structure for plants.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English, using PascalCase or camelCase format.'),
});

// Create a JSON representation of the schema for the model prompt
const jsonSchema = {
    type: 'object',
    properties: {
        shortDescription: {
            type: 'string',
            description: 'A brief, catchy, and SEO-friendly summary of the product (1-2 sentences).'
        },
        longDescription: {
            type: 'string',
            description: 'A detailed, persuasive, and comprehensive description of the product, following a specific structure for plants. Use newline characters for line breaks.'
        },
        keywords: {
            type: 'string',
            description: 'A comma-separated list of 5 to 10 relevant SEO keywords for the product, in English and in PascalCase or camelCase format (e.g. DroughtTolerant,SucculentGarden).'
        }
    },
    required: ['shortDescription', 'longDescription', 'keywords']
};


export async function POST(req: NextRequest) {
  console.log('--- /api/generate-description: POST request received (Direct Google AI SDK) ---');

  try {
    // 1. Fast fail if the Google AI API Key is not configured on the server.
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      const errorMsg = 'CRITICAL: GOOGLE_API_KEY environment variable is not set.';
      console.error(`/api/generate-description: ${errorMsg}`);
      return NextResponse.json(
        {
          error: 'Error de Configuración del Servidor',
          message: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.'
        },
        { status: 503 }
      );
    }

    // 2. Authenticate the user via Firebase Admin SDK.
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      console.error('/api/generate-description: Authentication token not provided.');
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
    console.log('/api/generate-description: User authenticated successfully.');

    // 3. Validate and parse request body
    const body = await req.json();
    const validationResult = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('/api/generate-description: Invalid request body:', validationResult.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const { productName, productType, keywords, language } = validationResult.data;
    console.log('/api/generate-description: Request body parsed and validated:', validationResult.data);


    // 4. Initialize Google AI SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        generationConfig: {
          responseMimeType: "application/json", // Enable JSON mode
        },
    });
    console.log('/api/generate-description: Google AI SDK initialized with gemini-1.5-flash-latest in JSON mode.');


    // 5. Construct the prompt
    const prompt = `
        You are an expert botanist, e-commerce copywriter, and SEO specialist.
        Your task is to generate compelling and optimized product descriptions and keywords for a plant product for a WooCommerce store.
        The response must be a valid JSON object that adheres to the provided schema. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

        JSON Schema:
        ${JSON.stringify(jsonSchema)}

        **Product Information:**
        - **Name:** ${productName}
        - **Type:** ${productType}
        - **Language for output:** ${language}
        ${keywords ? `- **Existing Keywords (use as inspiration):** ${keywords}` : ''}

        **Instructions:**

        1.  **shortDescription:** Write a concise and engaging summary in the requested language (${language}). It should immediately grab the customer's attention, be perfect for search result snippets, and highlight 2-3 key benefits (e.g., drought-tolerant, architectural form).
            *Example for Agave avellanidens:* "Agave avellanidens is a striking, drought-tolerant succulent native to Baja California. With its broad blue-green leaves and bold rosette form, it’s perfect for xeriscaping and modern dry-climate gardens. Low-maintenance and pollinator-friendly, it adds structure and resilience to any landscape."

        2.  **longDescription:** Write a detailed and persuasive product description in the requested language (${language}). It MUST follow this exact structure, using markdown for headings and bullet points. Make sure to use double asterisks (**) to bold all the labels (e.g., **Botanical Name:**). Use newline characters (\\n) for line breaks.
            **Botanical Name:** [Scientific name of the plant]
            **Common Names:** [List of common names, comma separated]
            **Mature Size:** [Typical height and spread, e.g., 3–5 feet (1–1.5 meters) in height, 4–6 feet (1.2–1.8 meters) in spread]
            **Light Requirements:** [e.g., Full sun, Partial shade]
            **Soil Requirements:** [e.g., Well-drained soils; thrives in sandy or rocky terrain]
            **Water Needs:** [e.g., Low; highly drought-tolerant once established]
            **Foliage:** [Description of leaves, e.g., Broad, thick, blue-green leaves with smooth surfaces and terminal spines]
            **Flowers:** [Description of flowers, e.g., Tall, branched flower stalk with greenish-yellow blooms, appearing once near the end of the plant’s life cycle]
            **Growth Rate:** [e.g., Slow, Moderate, Fast]

            **Uses:**
            - **Architectural Plant:** [Brief explanation of this use]
            - **Xeriscaping:** [Brief explanation of this use]
            - **Ecological Landscaping:** [Brief explanation of this use]

            **Benefits:**
            - **Extreme Drought Tolerance:** [Brief explanation of this benefit]
            - **Low Maintenance:** [Brief explanation of this benefit]
            - **Visual Interest:** [Brief explanation of this benefit]
            - **Habitat Support:** [Brief explanation of this benefit]

            [Final summary paragraph concluding the description.]

        3.  **keywords:** Generate a comma-separated list of 5 to 10 highly relevant SEO keywords/tags. These keywords MUST be in English and use PascalCase or camelCase format.
            *Example:* DroughtTolerant,SucculentGarden,Xeriscaping,LowWaterUse,ArchitecturalPlant,BajaCaliforniaNative

        Generate the JSON object based on the provided information.
    `;
    console.log('/api/generate-description: Prompt constructed. Calling generateContent...');

    // 6. Execute the call to the model
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    console.log('/api/generate-description: Received response text from model.');

    // 7. Parse and validate the JSON output
    const parsedJson = JSON.parse(responseText);
    const validatedOutput = GenerateProductDescriptionOutputSchema.safeParse(parsedJson);

    if (!validatedOutput.success) {
        console.error('/api/generate-description: AI model returned invalid JSON structure.', validatedOutput.error.flatten());
        console.error('/api/generate-description: Raw model output:', responseText);
        throw new Error("La IA devolvió una respuesta con un formato inesperado.");
    }
    
    console.log('/api/generate-description: Successfully generated and validated descriptions. Sending response.');
    return NextResponse.json(validatedOutput.data);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description POST handler ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    // Log additional details if available from the Google AI SDK
    if (error.response) {
        console.error('Google AI API Response Error:', JSON.stringify(error.response, null, 2));
    }
    console.error('Error Stack:', error.stack);
        
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json(
      {
        error: 'Error Interno del Servidor',
        message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
