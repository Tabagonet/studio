
'use server';
import '@/ai/genkit';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { generateProduct } from '@/ai/flows/generate-product-flow';
import { getApiClientsForUser } from '@/lib/api-helpers';

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
    });

    const validationResult = clientInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const clientInput = validationResult.data;
    
    let groupedProductsList = 'N/A';
    if (clientInput.productType === 'grouped' && clientInput.groupedProductIds && clientInput.groupedProductIds.length > 0) {
        const { wooApi } = await getApiClientsForUser(uid);
        if (wooApi) {
             try {
                const response = await wooApi.get('products', { include: clientInput.groupedProductIds, per_page: 100, lang: 'all' });
                if (response.data && response.data.length > 0) {
                    groupedProductsList = response.data.map((p: any) => `* Product: ${p.name}\\n* Details: ${p.short_description || p.description || 'No description'}`).join('\\n\\n');
                }
            } catch (e) {
                console.error('Failed to fetch details for grouped products:', e);
                groupedProductsList = 'Error fetching product details.';
            }
        }
    }
    
    const flowInput = { ...clientInput, uid, groupedProductsList };
    
    const generatedContent = await generateProduct(flowInput);
    
    return NextResponse.json(generatedContent);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
     if (errorMessage.trim().startsWith('<!DOCTYPE html>')) {
        return NextResponse.json({ error: 'La IA falló: Error interno del servidor de IA. Por favor, reintenta.' }, { status: 500 });
    }
    return NextResponse.json({ error: 'La IA falló: ' + errorMessage }, { status: 500 });
  }
}
