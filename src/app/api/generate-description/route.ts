
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
  shortDescription: z.string().describe('A brief, catchy, and SEO-friendly summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product, following a specific structure for plants. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English, using PascalCase or camelCase format.'),
});

// Create a JSON representation of the schema for the model prompt
const jsonSchema = {
    type: 'object',
    properties: {
        shortDescription: {
            type: 'string',
            description: "A brief, catchy, and SEO-friendly summary. The product name MUST be wrapped in <strong> HTML tags (e.g., '<strong>Cactus</strong>...')."
        },
        longDescription: {
            type: 'string',
            description: "A detailed description using HTML for formatting. Labels must be bold (<strong>) and values must be italic (<em>)."
        },
        keywords: {
            type: 'string',
            description: 'A comma-separated list of 5 to 10 relevant SEO keywords in English and in PascalCase or camelCase format (e.g. DroughtTolerant,SucculentGarden).'
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

        1.  **shortDescription:** Write a concise and engaging summary in ${language}. It is critically important that the product name, "${productName}", is wrapped in <strong> HTML tags. For example: "<strong>${productName}</strong> is a striking succulent...".

        2.  **longDescription:** Write a detailed and persuasive product description in the requested language (${language}). It MUST follow this exact structure. For each item, make the label bold using <strong> HTML tags and the value italic using <em> HTML tags.
            <strong>Botanical Name:</strong> <em>[Scientific name of the plant]</em><br>
            <strong>Common Names:</strong> <em>[List of common names, comma separated]</em><br>
            <strong>Mature Size:</strong> <em>[Typical height and spread]</em><br>
            <strong>Light Requirements:</strong> <em>[e.g., Full sun]</em><br>
            <strong>Soil Requirements:</strong> <em>[e.g., Well-drained]</em><br>
            <strong>Water Needs:</strong> <em>[e.g., Low]</em><br>
            <strong>Foliage:</strong> <em>[Description of leaves]</em><br>
            <strong>Flowers:</strong> <em>[Description of flowers]</em><br>
            <strong>Growth Rate:</strong> <em>[e.g., Moderate]</em><br>
            <br>
            <strong>Uses:</strong><br>
            - <strong>Architectural Plant:</strong> <em>[Brief explanation of this use]</em><br>
            - <strong>Xeriscaping:</strong> <em>[Brief explanation of this use]</em><br>
            - <strong>Ecological Landscaping:</strong> <em>[Brief explanation of this use]</em><br>
            <br>
            <strong>Benefits:</strong><br>
            - <strong>Extreme Drought Tolerance:</strong> <em>[Brief explanation of this benefit]</em><br>
            - <strong>Low Maintenance:</strong> <em>[Brief explanation of this benefit]</em><br>
            - <strong>Visual Interest:</strong> <em>[Brief explanation of this benefit]</em><br>
            - <strong>Habitat Support:</strong> <em>[Brief explanation of this benefit]</em><br>
            <br>
            <em>[Final summary paragraph.]</em>

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
