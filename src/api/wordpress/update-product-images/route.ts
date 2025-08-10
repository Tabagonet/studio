// src/app/api/wordpress/update-product-images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const updateImagesSchema = z.object({
  product_id: z.number(),
  mode: z.enum(['add', 'replace', 'remove', 'clear']),
  images: z.array(z.string()), // Array of URLs or numeric string IDs
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed: ' + e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = updateImagesSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { product_id, mode, images: imageUrlsOrIds } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }

        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) {
            throw new Error("Could not determine base site URL from WordPress API configuration.");
        }
        const customEndpointUrl = `${siteUrl}/wp-json/custom-api/v1/update-product-images`;
        
        const response = await wpApi.post(customEndpointUrl, {
            product_id: product_id,
            mode: mode,
            images: imageUrlsOrIds
        });

        if (response.data.status !== 'success') {
            throw new Error(response.data.message || 'The custom WordPress endpoint reported an error.');
        }

        return NextResponse.json({
            success: true,
            message: 'Images updated successfully.',
            data: response.data
        });

    } catch (error: any) {
        console.error("Error in /update-product-images:", error.response?.data || error.message);
        let errorMessage = error.response?.data?.message || 'An unexpected error occurred.';
         if (error.response?.status === 404) {
            errorMessage = 'Endpoint /custom-api/v1/update-product-images no encontrado. Asegúrate de que el plugin personalizado está activo y actualizado.';
        }
        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
        return NextResponse.json({ error: 'Failed to update images', details: errorMessage }, { status });
    }
}
