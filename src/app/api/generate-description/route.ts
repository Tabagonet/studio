
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
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images. Example: "Drought-Tolerant Agave Avellanidens Plant".'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users. Example: "A large Agave Avellanidens succulent with blue-green leaves in a sunny, rocky garden."'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library. This can be based on the short description.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry. This can be a more detailed version of the alt text or based on the long description.'),
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
        },
        imageTitle: {
            type: 'string',
            description: 'A concise, SEO-friendly title for the product images. Example: "Drought-Tolerant Agave Avellanidens Plant".'
        },
        imageAltText: {
            type: 'string',
            description: 'A descriptive alt text for SEO, describing the image for visually impaired users. Example: "A large Agave Avellanidens succulent with blue-green leaves in a sunny, rocky garden."'
        },
        imageCaption: {
            type: 'string',
            description: 'An engaging caption for the image, suitable for the media library. This can be based on the short description.'
        },
        imageDescription: {
            type: 'string',
            description: 'A detailed description for the image media library entry. This can be a more detailed version of the alt text or based on the long description.'
        }
    },
    required: ['shortDescription', 'longDescription', 'keywords', 'imageTitle', 'imageAltText', 'imageCaption', 'imageDescription']
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
        You are an expert botanist, e-commerce copywriter, and SEO specialist with access to a vast database of botanical information.
        Your primary task is to receive a plant name and generate a complete, accurate, and compelling product listing for a WooCommerce store. You must research the plant to find all the necessary details.
        The response must be a valid JSON object that adheres to the provided schema. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

        JSON Schema:
        ${JSON.stringify(jsonSchema)}

        **Input Information:**
        - **Plant Name:** ${productName}
        - **Language for output:** ${language}
        - **Product Type:** ${productType}
        ${keywords ? `- **User-provided Keywords (use for inspiration):** ${keywords}` : ''}

        **Instructions:**

        1.  **Research:** Based on the provided **Plant Name** ("${productName}"), use your botanical knowledge to find all the required information for the fields below (Botanical Name, Common Names, Mature Size, etc.). If the name is ambiguous, use the most common or commercially relevant plant.

        2.  **Generate Content:** Populate the JSON object according to the following specifications:

            a.  **shortDescription:** Write a concise and engaging summary in ${language}. The product name, "${productName}", MUST be wrapped in <strong> HTML tags.

            b.  **longDescription:** Write a detailed description in ${language}. It MUST follow this structure. For each item, **you must find the correct information** and format it with the label in bold (<strong>) and the value in italic (<em>).
                <strong>Botanical Name:</strong> <em>[Find and insert the scientific name]</em><br>
                <strong>Common Names:</strong> <em>[Find and list common names]</em><br>
                <strong>Mature Size:</strong> <em>[Find and insert typical height and spread]</em><br>
                <strong>Light Requirements:</strong> <em>[Find and insert light needs]</em><br>
                <strong>Soil Requirements:</strong> <em>[Find and insert soil needs]</em><br>
                <strong>Water Needs:</strong> <em>[Find and insert water needs]</em><br>
                <strong>Foliage:</strong> <em>[Find and describe the foliage]</em><br>
                <strong>Flowers:</strong> <em>[Find and describe the flowers]</em><br>
                <strong>Growth Rate:</strong> <em>[Find and insert the growth rate]</em><br>
                <br>
                <strong>Uses:</strong><br>
                - <strong>Architectural Plant:</strong> <em>[Find and explain this use]</em><br>
                - <strong>Xeriscaping:</strong> <em>[Find and explain this use]</em><br>
                - <strong>Ecological Landscaping:</strong> <em>[Find and explain this use]</em><br>
                <br>
                <strong>Benefits:</strong><br>
                - <strong>Extreme Drought Tolerance:</strong> <em>[Find and explain this benefit]</em><br>
                - <strong>Low Maintenance:</strong> <em>[Find and explain this benefit]</em><br>
                - <strong>Visual Interest:</strong> <em>[Find and explain this benefit]</em><br>
                - <strong>Habitat Support:</strong> <em>[Find and explain this benefit]</em><br>
                <br>
                <em>[Write a final summary paragraph.]</em>

            c.  **keywords:** Generate a comma-separated list of 5-10 relevant SEO keywords in English (PascalCase or camelCase).

            d. **Image Metadata:** Generate metadata based on the researched plant information.
                - **imageTitle:** A concise, SEO-friendly title.
                - **imageAltText:** A descriptive alt text for accessibility.
                - **imageCaption:** An engaging caption.
                - **imageDescription:** A detailed description for the media library.


        Generate the complete JSON object based on your research of "${productName}".
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
