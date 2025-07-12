import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';
import axios from 'axios';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const verifyPartnerSchema = z.object({
  entityId: z.string().min(1, "entityId es requerido."),
  entityType: z.enum(['user', 'company'], { required_error: "entityType es requerido." }),
});

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No se pudo obtener el token de autenticación.');
        if (!adminAuth) throw new Error("Firebase Admin not initialized.");
        await adminAuth.verifyIdToken(token);
        
        const body = await req.json();
        const validation = verifyPartnerSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Datos de entrada inválidos.', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { entityId, entityType } = validation.data;
        
        // This function now attempts the token exchange, which serves as verification.
        const { partnerApiToken } = await getPartnerCredentials(entityId, entityType);

        const graphqlEndpoint = `https://partners.shopify.com/api/2024-07/graphql.json`;
        
        // A simple query to confirm the token works.
        const query = `query { organizations(first: 1) { nodes { id } } }`;

        const response = await axios.post(
            graphqlEndpoint,
            { query },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': partnerApiToken,
                },
                timeout: 15000,
            }
        );

        if (response.data.errors) {
            const errorMessage = response.data.errors[0]?.message || 'Credenciales o permisos inválidos.';
            throw new Error(errorMessage);
        }

        if (response.data.data?.organizations) {
            return NextResponse.json({ success: true, message: '¡Credenciales verificadas correctamente!' });
        } else {
            throw new Error('Respuesta inesperada de la API de Shopify Partner.');
        }

    } catch (error: any) {
        console.error("Shopify Partner Verification Error:", error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || error.response?.data?.errors?.[0]?.message || error.message || 'Fallo al verificar las credenciales de Partner.';
        return NextResponse.json({ success: false, error: errorMessage }, { status: 400 });
    }
}
