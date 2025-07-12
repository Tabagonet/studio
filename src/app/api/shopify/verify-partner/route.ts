
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const verifyPartnerSchema = z.object({
  userId: z.string(),
});

export async function POST(req: NextRequest) {
    let token: string;
    let requestingUid: string;
    try {
        const authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) throw new Error('No auth token provided.');
        token = authToken;
        if (!adminAuth) throw new Error("Firebase Admin not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        requestingUid = decodedToken.uid;
        
        const body = await req.json();
        const validation = verifyPartnerSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
        }
        
        const { userId } = validation.data;
        
        // This helper now fetches the correct user/company specific credentials.
        // It's crucial that it's called with the correct target userId, not the requester's UID.
        const { accessToken } = await getPartnerCredentials(userId); 

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
                timeout: 15000,
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
