
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';


// Define input schema for validation
const GenerateProductDescriptionInputSchema = z.object({
  productName: z.string().min(1, 'Product name is required.'),
  productType: z.string(),
  keywords: z.string().optional(),
  language: z.enum(['Spanish', 'English']).default('Spanish'),
  groupedProductIds: z.array(z.number()).optional(),
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

const DEFAULT_PROMPT_TEMPLATE = `You are an expert botanist, e-commerce copywriter, and SEO specialist with access to a vast database of botanical information.
Your primary task is to receive a plant name and generate a complete, accurate, and compelling product listing for a WooCommerce store. You must research the plant to find all the necessary details.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Plant Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type):** {{groupedProductsList}}

**Instructions:**
1.  **Research:** Based on the provided **Plant Name** ("{{productName}}"), use your botanical knowledge to find all the required information for the fields below. If the product type is "Grouped", use the "Contained Products" list to inform your descriptions. If the name is ambiguous, use the most common or commercially relevant plant.

2.  **Generate Content:** Populate a JSON object with the following keys and specifications:

    a.  **"shortDescription":** Write a concise and engaging summary in {{language}}. The product name, "{{productName}}", MUST be wrapped in <strong> HTML tags. If it's a grouped product, summarize the collection.

    b.  **"longDescription":** Write a detailed description in {{language}}. It MUST follow this structure. For each item, **you must find the correct information** and format it with the label in bold (<strong>) and the value in italic (<em>). For a "Grouped" product, adapt the details to describe the collection as a whole.
        <strong>Botanical Name:</strong> <em>[Find and insert the scientific name, or general family for groups]</em><br>
        <strong>Common Names:</strong> <em>[Find and list common names, or a collective name for groups]</em><br>
        <strong>Mature Size:</strong> <em>[Find and insert typical height and spread]</em><br>
        <strong>Light Requirements:</strong> <em>[Find and insert light needs]</em><br>
        <strong>Soil Requirements:</strong> <em>[Find and insert soil needs]</em><br>
        <strong>Water Needs:</strong> <em>[Find and insert water needs]</em><br>
        <strong>Foliage:</strong> <em>[Find and describe the foliage]</em><br>
        <strong>Flowers:</strong> <em>[Find and describe the flowers]</em><br>
        <strong>Growth Rate:</strong> <em>[Find and insert the growth rate]</em><br>
        <br>
        <strong>Uses:</strong><br>
        - <strong>Architectural Plant:</strong> <em>[Explain this use based on research]</em><br>
        - <strong>Xeriscaping:</strong> <em>[Explain this use based on research]</em><br>
        - <strong>Ecological Landscaping:</strong> <em>[Explain this use based on research]</em><br>
        <br>
        <strong>Benefits:</strong><br>
        - <strong>Extreme Drought Tolerance:</strong> <em>[Explain this benefit based on research]</em><br>
        - <strong>Low Maintenance:</strong> <em>[Explain this benefit based on research]</em><br>
        - <strong>Visual Interest:</strong> <em>[Explain this benefit based on research]</em><br>
        - <strong>Habitat Support:</strong> <em>[Explain this benefit based on research]</em><br>
        <br>
        <em>[Write a final summary paragraph here. If "Grouped", highlight the value of the collection.]</em>

    c.  **"keywords":** Generate a comma-separated list of 5-10 relevant SEO keywords in English (PascalCase or camelCase).

    d.  **"imageTitle":** Generate a concise, SEO-friendly title for product images. Example: "Drought-Tolerant Agave Avellanidens Plant".

    e.  **"imageAltText":** Generate a descriptive alt text for SEO, describing the image for visually impaired users. Example: "A large Agave Avellanidens succulent with blue-green leaves in a sunny, rocky garden."

    f.  **"imageCaption":** Generate an engaging caption for the image, suitable for the media library. This can be based on the short description.

    g.  **"imageDescription":** Generate a detailed description for the image media library entry. This can be a more detailed version of the alt text or based on the long description.

Generate the complete JSON object based on your research of "{{productName}}".`;

// Fetches the user's custom prompt template, or returns the default.
async function getUserPromptTemplate(uid: string): Promise<string> {
    if (!adminDb) {
        console.warn("generate-description API: Firestore not available, using default prompt template.");
        return DEFAULT_PROMPT_TEMPLATE;
    }
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        if (userSettingsDoc.exists()) {
            const data = userSettingsDoc.data();
            if (data && data.promptTemplate) {
                console.log('/api/generate-description: Found and using custom user prompt template.');
                return data.promptTemplate;
            }
        }
        console.log('/api/generate-description: No custom user prompt found, using default template.');
        return DEFAULT_PROMPT_TEMPLATE;
    } catch (error) {
        console.error("Error fetching user prompt template, using default:", error);
        return DEFAULT_PROMPT_TEMPLATE;
    }
}

export async function POST(req: NextRequest) {
  console.log('--- /api/generate-description: POST request received ---');

  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      const errorMsg = 'CRITICAL: GOOGLE_API_KEY environment variable is not set.';
      console.error(`/api/generate-description: ${errorMsg}`);
      return NextResponse.json({ error: 'Error de Configuración del Servidor', message: 'La clave API de Google AI no está configurada en el servidor.' }, { status: 503 });
    }

    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      console.error('/api/generate-description: Authentication token not provided.');
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    console.log('/api/generate-description: User authenticated successfully with UID:', uid);

    const body = await req.json();
    const validationResult = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('/api/generate-description: Invalid request body:', validationResult.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const { productName, productType, keywords, language, groupedProductIds } = validationResult.data;
    console.log('/api/generate-description: Request body parsed and validated:', validationResult.data);

    // Fetch details for grouped products if applicable
    let groupedProductsList = '';
    if (productType === 'grouped' && groupedProductIds && groupedProductIds.length > 0) {
        try {
            console.log('/api/generate-description: Fetching details for grouped products:', groupedProductIds);
            const { wooApi } = await getApiClientsForUser(uid);
            const response = await wooApi.get("products", { include: groupedProductIds, per_page: 100 });
            if (response.data && response.data.length > 0) {
                groupedProductsList = response.data.map((product: any) =>
                    `- ${product.name} (SKU: ${product.sku || 'N/A'})`
                ).join('\n');
                 console.log('/api/generate-description: Successfully fetched grouped product details.');
            }
        } catch (e) {
            console.error("Failed to fetch details for grouped products:", e);
            groupedProductsList = 'Error fetching product details.';
        }
    }


    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash-latest",
        systemInstruction: `You are an expert botanist, e-commerce copywriter, and SEO specialist. Your primary task is to generate a single, valid JSON object based on the user's prompt. The JSON object must strictly follow the schema requested in the user prompt. Do not add any extra text, comments, or markdown formatting like \`\`\`json around the JSON response.`,
        generationConfig: {
          responseMimeType: "application/json",
        },
    });
    console.log('/api/generate-description: Google AI SDK initialized.');

    // Fetch the user's custom prompt template or the default one.
    const promptTemplate = await getUserPromptTemplate(uid);
    
    // Replace placeholders in the template with actual data.
    const finalPrompt = promptTemplate
      .replace(/{{productName}}/g, productName)
      .replace(/{{language}}/g, language)
      .replace(/{{productType}}/g, productType)
      .replace(/{{keywords}}/g, keywords || '')
      .replace(/{{groupedProductsList}}/g, groupedProductsList || 'N/A');

    console.log('/api/generate-description: Final prompt constructed. Calling generateContent...');

    const result = await model.generateContent(finalPrompt);
    const response = result.response;
    const responseText = response.text();
    console.log('/api/generate-description: Received response text from model.');

    const parsedJson = JSON.parse(responseText);
    const validatedOutput = GenerateProductDescriptionOutputSchema.safeParse(parsedJson);

    if (!validatedOutput.success) {
        console.error('/api/generate-description: AI model returned invalid JSON structure.', validatedOutput.error.flatten());
        console.error('/api/generate-description: Raw model output:', responseText);
        throw new Error("La IA devolvió una respuesta con un formato inesperado.");
    }
    
    console.log('/api/generate-description: Successfully generated and validated descriptions.');
    return NextResponse.json(validatedOutput.data);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    if (error.response) {
        console.error('Google AI API Response Error:', JSON.stringify(error.response, null, 2));
    }
    console.error('Error Stack:', error.stack);
        
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ error: 'Error Interno del Servidor', message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}` }, { status: 500 });
  }
}
