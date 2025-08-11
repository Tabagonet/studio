

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';

const FullProductOutputSchema = z.object({
  name: z.string().describe('A new, SEO-friendly product title. It should start with the base name and be enriched with the descriptive context.'),
  shortDescription: z.string().describe('A brief, catchy summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  tags: z.array(z.string()).describe('An array of 5 to 10 relevant SEO keywords/tags for the product, in the specified {{language}}.'),
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

async function getProductDescriptionPrompt(uid: string): Promise<string> {
    const defaultPrompt = `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Base Name (from CSV, this is the starting point):** {{baseProductName}}
- **Descriptive Context (from image filename, use this for inspiration):** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **Category:** {{categoryName}}
- **User-provided Tags (for inspiration):** {{tags}}
- **Contained Products (for "Grouped" type only):**
{{{groupedProductsList}}}

**Instructions:**
Generate a JSON object with the following keys.

a.  **"name":** Create a new, SEO-friendly product title in {{language}}. It MUST start with the "Base Name" and should be intelligently expanded using the "Descriptive Context" to make it more appealing and searchable.
b.  **"shortDescription":** A concise and engaging summary in {{language}}, relevant to the newly generated name.
c.  **"longDescription":** A detailed description in {{language}}, relevant to the newly generated name. Use HTML tags like <strong>, <em>, and <br> for formatting.
d.  **"tags":** An array of 5 to 10 relevant SEO keywords/tags in {{language}}.
e.  **"imageTitle":** A concise, SEO-friendly title for product images.
f.  **"imageAltText":** A descriptive alt text for SEO.
g.  **"imageCaption":** An engaging caption for the image.
h.  **"imageDescription":** A detailed description for the image media library entry.

Generate the complete JSON object now.`;
    if (!adminDb) return defaultPrompt;
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        return userSettingsDoc.data()?.prompts?.productDescription || defaultPrompt;
    } catch (error) {
        console.error("Error fetching 'productDescription' prompt, using default.", error);
        return defaultPrompt;
    }
}

async function getEntityRef(uid: string, cost: number): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
}


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
        baseProductName: z.string().optional(),
        productName: z.string().min(1),
        productType: z.string(),
        categoryName: z.string().optional(),
        tags: z.string().optional(),
        language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
        groupedProductIds: z.array(z.number()).optional(),
        mode: z.enum(['full_product', 'image_meta_only']).default('full_product'),
    });

    const validationResult = clientInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const clientInput = validationResult.data;
    
    const { wooApi } = await getApiClientsForUser(uid);
    
    let groupedProductsList = 'N/A';
    if (clientInput.productType === 'grouped' && clientInput.groupedProductIds && clientInput.groupedProductIds.length > 0) {
        if (wooApi) {
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
    let creditCost: number;

    if (clientInput.mode === 'image_meta_only') {
      outputSchema = ImageMetaOnlySchema;
      promptTemplate = await getProductDescriptionPrompt(uid);
      creditCost = 1;
    } else { // full_product
      outputSchema = FullProductOutputSchema;
      promptTemplate = await getProductDescriptionPrompt(uid);
      creditCost = 10;
    }
    
    const cleanedCategoryName = clientInput.categoryName ? clientInput.categoryName.replace(/—/g, '').trim() : '';

    const template = Handlebars.compile(promptTemplate, { noEscape: true });
    const templateData = { ...clientInput, categoryName: cleanedCategoryName, tags: clientInput.tags || '', groupedProductsList };
    const finalPrompt = template(templateData);
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const aiContent = outputSchema.parse(JSON.parse(response.text()));
    
    if (!aiContent) {
      throw new Error('AI returned an empty response.');
    }
    
    const [entityRef, cost] = await getEntityRef(uid, creditCost);
    await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });

    return NextResponse.json(aiContent);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    if (error.message && error.message.includes('503')) {
        return NextResponse.json({ error: 'El servicio de IA está sobrecargado en este momento. Por favor, inténtalo de nuevo más tarde.' }, { status: 503 });
    }
    let errorMessage = 'La IA falló: ' + (error instanceof Error ? error.message : String(error));
    if (error instanceof z.ZodError) {
        errorMessage = 'La IA falló: ' + JSON.stringify(error.errors);
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
