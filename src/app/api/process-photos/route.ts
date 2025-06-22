
// src/app/api/process-photos/route.ts
// NOTE: This endpoint has been repurposed for batch product updates via AI.
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, generateProductContent } from '@/lib/api-helpers';
import { z } from 'zod';

const BatchUpdateInputSchema = z.object({
  productIds: z.array(z.number()).min(1, 'At least one product ID is required.'),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }
    
    try {
        const body = await req.json();
        const validation = BatchUpdateInputSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        const { productIds } = validation.data;

        const { wooApi } = await getApiClientsForUser(uid);

        const results = {
            success: [] as number[],
            failed: [] as { id: number; reason: string }[],
        };

        for (const productId of productIds) {
            try {
                // 1. Fetch product from Woo
                const productResponse = await wooApi.get(`products/${productId}`);
                const product = productResponse.data;

                // 2. Call AI content generator
                const aiContent = await generateProductContent({
                    productName: product.name,
                    productType: product.type,
                    language: 'Spanish', 
                    keywords: product.tags?.map((t: any) => t.name).join(', ') || '',
                    groupedProductIds: [], // Not supported in batch mode for now
                }, uid, wooApi);

                // 3. Update product in Woo
                await wooApi.put(`products/${productId}`, {
                    short_description: aiContent.shortDescription,
                    description: aiContent.longDescription,
                    tags: aiContent.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name),
                });

                results.success.push(productId);

            } catch (error: any) {
                console.error(`Failed to process product ID ${productId}:`, error.response?.data?.message || error.message);
                results.failed.push({ id: productId, reason: error.response?.data?.message || error.message || 'Unknown error' });
            }
        }
        
        return NextResponse.json({
            message: `Proceso completado. ${results.success.length} producto(s) actualizado(s), ${results.failed.length} fallido(s).`,
            results,
        });

    } catch (error: any) {
        console.error('Error in batch update API:', error);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.message }, { status: 500 });
    }
}
