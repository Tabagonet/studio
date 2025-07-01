
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const linkSchema = z.object({
  translations: z.record(z.string(), z.number()), // e.g. { "en": 123, "es": 456 }
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
        const validation = linkSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { translations } = validation.data;
        const postIds = Object.values(translations);

        if (postIds.length < 2) {
            return NextResponse.json({ error: 'At least two posts are required to link.' }, { status: 400 });
        }

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured for the active connection.');
        }

        // This requires the user to have added the custom PHP code to their functions.php
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) {
            throw new Error("Could not determine base site URL from WordPress API configuration.");
        }
        const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/link-translations`;

        console.log(`[link-translations] Calling custom endpoint: ${customEndpointUrl}`);
        
        // The custom endpoint will handle calling pll_save_post_translations
        const response = await wpApi.post(customEndpointUrl, { translations });
        
        if (response.data.success) {
            return NextResponse.json({
                success: true,
                message: response.data.message || `${postIds.length} entradas han sido enlazadas correctamente.`,
            });
        } else {
            throw new Error(response.data.message || 'The custom WordPress endpoint reported an error.');
        }

    } catch (error: any) {
        console.error('Error linking translations:', error.response?.data || error.message);
        let errorMessage = 'An unexpected error occurred during the linking process.';
        if (error.response?.data?.message) {
            errorMessage = `WordPress Error: ${error.response.data.message}`;
        } else if (error.message) {
            errorMessage = error.message;
        }

        if (error.response?.status === 404) {
            errorMessage = 'Endpoint /custom/v1/link-translations no encontrado en tu WordPress. Por favor, asegúrate de haber añadido el código PHP a tu archivo functions.php.';
        }

        const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);

        return NextResponse.json({ 
            error: 'Failed to link translations.', 
            message: errorMessage
        }, { status });
    }
}
