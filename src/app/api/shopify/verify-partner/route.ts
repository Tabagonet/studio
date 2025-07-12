
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser, getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const { uid } = await getApiClientsForUser(req as any); // Re-uses the auth logic from the helper
        
        // This helper now fetches the correct user/company specific credentials.
        const { accessToken } = await getPartnerCredentials(uid); // Pass UID to get user-specific creds

        const graphqlEndpoint = `https://partners.shopify.com/api/2024-07/graphql.json`;
        
        // A simple query to check if the token is valid.
        const query = `query { organizations(first: 1) { nodes { id } } }`;

        const response = await axios.post(
            graphqlEndpoint,
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': accessToken,
                },
            }
        );

        if (response.data.errors) {
            const errorMessage = response.data.errors[0]?.message || 'Invalid credentials or permissions.';
            throw new Error(errorMessage);
        }

        if (response.data.data?.organizations) {
            return NextResponse.json({ success: true, message: 'Credenciales verificadas correctamente.' });
        } else {
            throw new Error('Respuesta inesperada de la API de Shopify Partner.');
        }

    } catch (error: any) {
        console.error("Shopify Partner Verification Error:", error.response?.data || error.message);
        const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'Fallo al verificar las credenciales de Partner.';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }
}
