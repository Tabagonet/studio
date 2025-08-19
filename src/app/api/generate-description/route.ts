
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser, getPromptForConnection, getEntityRef as getEntityRefHelper } from '@/lib/api-helpers';
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


async function getCreditEntityRef(uid: string, cost: number): Promise<[FirebaseFirestore.DocumentReference, number]> {
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
        tags: z.array(z.string()).optional(), // Corrected to array of strings
        language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).optional().default('Spanish'),
        groupedProductIds: z.array(z.number()).optional(),
        mode: z.enum(['full_product', 'image_meta_only']).default('full_product'),
    });

    const validationResult = clientInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const clientInput = validationResult.data;
    
    const { wooApi, activeConnectionKey } = await getApiClientsForUser(uid);
    const [entityRef] = await getEntityRefHelper(uid);
    
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
    
    let outputSchema: z.ZodTypeAny;
    let creditCost: number;

    if (clientInput.mode === 'image_meta_only') {
      outputSchema = ImageMetaOnlySchema;
      creditCost = 1;
    } else { // full_product
      outputSchema = FullProductOutputSchema;
      creditCost = 10;
    }
    
    const promptTemplate = await getPromptForConnection('productDescription', activeConnectionKey, entityRef);
    
    const cleanedCategoryName = clientInput.categoryName ? clientInput.categoryName.replace(/—/g, '').trim() : '';

    const template = Handlebars.compile(promptTemplate, { noEscape: true });
    // Join array of tags into a comma-separated string for the template
    const templateData = { ...clientInput, categoryName: cleanedCategoryName, tags: (clientInput.tags || []).join(', '), groupedProductsList };
    const finalPrompt = template(templateData);
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const aiContent = outputSchema.parse(JSON.parse(response.text()));
    
    if (!aiContent) {
      throw new Error('AI returned an empty response.');
    }
    
    const [creditEntityRef, cost] = await getCreditEntityRef(uid, creditCost);
    await creditEntityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });

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
    return NextResponse.json({ error: errorMessage }, { status: 5