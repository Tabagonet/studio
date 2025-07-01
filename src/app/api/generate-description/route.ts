
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';

export const dynamic = 'force-dynamic';

const FullProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});

const ImageMetaOnlySchema = z.object({
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});


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

    const clientInputSchema = z.object({
        productName: z.string().min(1),
        productType: z.string(),
        keywords: z.string().optional(),
        language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
        groupedProductIds: z.array(z.number()).optional(),
        mode: z.enum(['full_product', 'image_meta_only']).default('full_product'),
    });

    const validationResult = clientInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const clientInput = validationResult.data;
    
    // Fetch clients and settings ONCE
    const { wooApi, settings } = await getApiClientsForUser(uid);
    
    let groupedProductsList = 'N/A';
    if (clientInput.productType === 'grouped' && clientInput.groupedProductIds && clientInput.groupedProductIds.length > 0) {
        if (wooApi) { // Check if wooApi was successfully created
             try {
                const response = await wooApi.get('products', { include: clientInput.groupedProductIds, per_page: 100, lang: 'all' });
                if (response.data && response.data.length > 0) {
                    groupedProductsList = response.data.map((p: any) => `* Product: ${p.name}\\n* Details: ${p.short_description || p.description || 'No description'}`).join('\\n\\n');
                }
            } catch (e: unknown) {
                console.error('Failed to fetch details for grouped products:', e);
                groupedProductsList = 'Error fetching product details.';
            }
        }
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    
    let promptTemplate: string;
    let outputSchema: z.ZodTypeAny;

    if (clientInput.mode === 'image_meta_only') {
      outputSchema = ImageMetaOnlySchema;
      promptTemplate = `You are an expert e-commerce copywriter and SEO specialist.
Your task is to generate ONLY the SEO metadata for product images.
The response must be a single, valid JSON object with the following keys: "imageTitle", "imageAltText", "imageCaption", "imageDescription".

**Input Information:**
- **Product Name:** {{productName}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}

Generate the JSON object based on your research of "{{productName}}".`;
    } else { // full_product
      outputSchema = FullProductOutputSchema;
      const activeKey = settings?.activeConnectionKey;
      const customPrompt = activeKey ? settings?.connections?.[activeKey]?.promptTemplate : null;

      promptTemplate = customPrompt || `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a single, valid JSON object with the following keys: "shortDescription", "longDescription", "keywords", "imageTitle", "imageAltText", "imageCaption", "imageDescription". Do not include markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):** {{{groupedProductsList}}}

Generate the complete JSON object based on your research of "{{productName}}".`;
    }

    const template = Handlebars.compile(promptTemplate, { noEscape: true });
    const finalPrompt = template({ ...clientInput, groupedProductsList });
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const aiContent = outputSchema.parse(JSON.parse(response.text()));
    
    if (!aiContent) {
      throw new Error('AI returned an empty response.');
    }
    
    // Increment AI usage count
    if (adminDb) {
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
    }

    return NextResponse.json(aiContent);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    let errorMessage = 'La IA falló: ' + (error instanceof Error ? error.message : String(error));
    if (error instanceof z.ZodError) {
        errorMessage = 'La IA falló: ' + JSON.stringify(error.errors);
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
