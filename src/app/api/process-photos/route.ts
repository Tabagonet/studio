
'use server';
// NOTE: This endpoint has been repurposed for batch product updates via AI.
import {NextRequest, NextResponse} from 'next/server';
import {adminAuth} from '@/lib/firebase-admin';
import {getApiClientsForUser} from '@/lib/api-helpers';
import {z} from 'zod';
import * as genkit from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';
import Handlebars from 'handlebars';

const BatchUpdateInputSchema = z.object({
  productIds: z.array(z.number()).min(1, 'At least one product ID is required.'),
  action: z.enum(['generateDescriptions', 'generateImageMetadata']),
  force: z.boolean().optional().default(false),
});

// Schemas for the AI call
const GenerateProductOutputSchema = z.object({
  shortDescription: z.string().describe('A brief, catchy summary of the product.'),
  longDescription: z.string().describe('A detailed, persuasive description of the product.'),
  keywords: z.string().describe('A comma-separated list of 5 to 10 relevant SEO keywords.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO.'),
  imageCaption: z.string().describe('An engaging caption for the image.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});

const generateProductPromptTemplate = `You are an expert e-commerce copywriter and SEO specialist.
    Your task is to receive product information and generate a complete, accurate, and compelling product listing.
    The response must be a single, valid JSON object.
    
    **Product Information:**
    - **Product Name:** {{productName}}
    - **Language for output:** {{language}}
    - **Product Type:** {{productType}}
    - **User-provided Keywords (for inspiration):** {{keywords}}

    Generate the complete JSON object based on your research of "{{productName}}".`;


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

    // --- Confirmation Check Step (if force is false) ---
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
          console.error(
            `Failed to check product ${productId} for confirmation. Error: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }

      if (productsToConfirm.length > 0) {
        return NextResponse.json({
          confirmationRequired: true,
          products: productsToConfirm,
        });
      }
    }

    // --- Execution Step ---
    const results = {
      success: [] as number[],
      failed: [] as {id: number; reason: string}[],
    };

    for (const productId of productIds) {
      try {
        const productResponse = await wooApi.get(`products/${productId}`);
        const product = productResponse.data;

        const aiInput = {
          productName: product.name,
          productType: product.type,
          language: 'Spanish',
          keywords: product.tags?.map((t: any) => t.name).join(', ') || '',
        };
        const template = Handlebars.compile(generateProductPromptTemplate, { noEscape: true });
        const finalPrompt = template(aiInput);

        const { output: aiContent } = await genkit.generate({
          model: googleAI('gemini-1.5-flash-latest'),
          prompt: finalPrompt,
          output: { schema: GenerateProductOutputSchema }
        });

        if (!aiContent) {
          throw new Error('AI returned an empty response.');
        }

        if (action === 'generateDescriptions') {
          await wooApi.put(`products/${productId}`, {
            short_description: aiContent.shortDescription,
            description: aiContent.longDescription,
            tags: aiContent.keywords
              .split(',')
              .map((k: string) => ({name: k.trim()}))
              .filter((k: {name: string}) => k.name),
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

    return NextResponse.json({
      message: `Proceso completado. ${results.success.length} producto(s) actualizado(s), ${results.failed.length} fallido(s).`,
      results,
    });
  } catch (error: any) {
    console.error('Error in batch update API:', error);
    const status = error.message.includes('not configured') ? 400 : error.response?.status || 500;
     if (error.message.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'La IA falló: ' + error.message,}, {status});
  }
}
