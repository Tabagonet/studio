
import {NextRequest, NextResponse} from 'next/server';
import {adminAuth, adminDb, admin} from '@/lib/firebase-admin';
import {getApiClientsForUser} from '@/lib/api-helpers';
import {z} from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';

const BatchUpdateInputSchema = z.object({
  productIds: z.array(z.number()).min(1, 'At least one product ID is required.'),
  action: z.enum(['generateDescriptions', 'generateImageMetadata']),
  force: z.boolean().optional().default(false),
});

// Define schemas directly in the route
const GenerateProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords/tags for the product, in English.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});


export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    if (!adminAuth) throw new Error('Firebase Admin Auth is not initialized.');
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
    return NextResponse.json(
      {error: 'Authentication failed', message: error.message},
      {status: 401}
    );
  }

  try {
    const body = await req.json();
    const validation = BatchUpdateInputSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {error: 'Invalid input', details: validation.error.flatten()},
        {status: 400}
      );
    }
    const {productIds, action, force} = validation.data;

    const {wooApi, wpApi} = await getApiClientsForUser(uid);
    if (!wooApi) {
      throw new Error('WooCommerce API is not configured for the active connection.');
    }
    if (action === 'generateImageMetadata' && !wpApi) {
      throw new Error('WordPress API must be configured to update image metadata.');
    }

    if (!force) {
      const productsToConfirm: {id: number; name: string; reason: string}[] =
        [];
      for (const productId of productIds) {
        try {
          const {data: product} = await wooApi.get(`products/${productId}`);
          let reason = '';
          if (
            action === 'generateDescriptions' &&
            (product.description || product.short_description)
          ) {
            reason = 'Ya tiene descripción.';
          } else if (
            action === 'generateImageMetadata' &&
            product.images?.length > 0 &&
            product.images[0].alt
          ) {
            reason = 'La imagen ya tiene texto alternativo.';
          }

          if (reason) {
            productsToConfirm.push({
              id: productId,
              name: product.name,
              reason,
            });
          }
        } catch (error: any) {
          console.error(`Failed to check product ${productId} for confirmation.`);
        }
      }

      if (productsToConfirm.length > 0) {
        return NextResponse.json({
          confirmationRequired: true,
          products: productsToConfirm,
        });
      }
    }

    const results = {
      success: [] as number[],
      failed: [] as {id: number; reason: string}[],
    };

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    let aiCallCount = 0;

    for (const productId of productIds) {
      try {
        const productResponse = await wooApi.get(`products/${productId}`);
        const product = productResponse.data;

        const generateProductPromptTemplate = `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a single, valid JSON object with the following keys: "shortDescription", "longDescription", "keywords", "imageTitle", "imageAltText", "imageCaption", "imageDescription". Do not include markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Product Name:** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **User-provided Keywords (for inspiration):** {{keywords}}
- **Contained Products (for "Grouped" type only):** {{{groupedProductsList}}}

Generate the complete JSON object based on your research of "{{productName}}".`;

        const template = Handlebars.compile(generateProductPromptTemplate, { noEscape: true });
        const finalPrompt = template({ 
            productName: product.name,
            productType: product.type,
            language: 'Spanish',
            keywords: product.tags?.map((t: any) => t.name).join(', ') || '',
            groupedProductsList: '',
        });
        
        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const aiContent = GenerateProductOutputSchema.parse(JSON.parse(response.text()));
        aiCallCount++;

        if (!aiContent) {
          throw new Error('AI returned an empty response.');
        }

        if (action === 'generateDescriptions') {
          await wooApi.put(`products/${productId}`, {
            short_description: aiContent.shortDescription,
            description: aiContent.longDescription,
            tags: aiContent.keywords.split(',').map((k: string) => ({name: k.trim()})).filter((k: {name: string}) => k.name),
          });
        } else if (action === 'generateImageMetadata') {
          if (!wpApi) throw new Error('WordPress API client is not available.');
          if (!product.images || product.images.length === 0) {
            throw new Error('El producto no tiene imágenes para actualizar.');
          }
          for (const image of product.images) {
            await wpApi.post(`media/${image.id}`, {
              title: aiContent.imageTitle,
              alt_text: aiContent.imageAltText,
              caption: aiContent.imageCaption,
              description: aiContent.imageDescription,
            });
          }
        }

        results.success.push(productId);
      } catch (error: any) {
        console.error(`Failed to process product ID ${productId}:`, error.response?.data?.message || error.message);
        results.failed.push({
          id: productId,
          reason: error.response?.data?.message || error.message || 'Unknown error',
        });
      }
    }
    
    // Increment AI usage count
    if (adminDb && aiCallCount > 0) {
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(aiCallCount) }, { merge: true });
    }

    return NextResponse.json({
      message: `Proceso completado. ${results.success.length} producto(s) actualizado(s), ${results.failed.length} fallido(s).`,
      results,
    });
  } catch (error: any) {
    console.error('🔥 Error in /api/process-photos:', error);
    const status = error.message.includes('not configured') ? 400 : error.response?.status || 500;
     let errorMessage = 'La IA falló: ' + error.message;
    if (error instanceof z.ZodError) {
        errorMessage = 'La IA falló: ' + JSON.stringify(error.errors);
    }
    return NextResponse.json({ error: errorMessage }, {status});
  }
}
