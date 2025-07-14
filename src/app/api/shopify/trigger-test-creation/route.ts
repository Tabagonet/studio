// src/app/api/shopify/trigger-test-creation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import axios, { AxiosError } from 'axios';

async function verifyUserToken(req: NextRequest): Promise<string | null> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return null;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken.uid;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    console.log('[API /trigger-test-creation] Recibida petición POST.');

    const uid = await verifyUserToken(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized: Invalid user token.' }, { status: 401 });
    }

    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        console.error('[API /trigger-test-creation] FATAL: SHOPIFY_AUTOMATION_API_KEY is not set on the server.');
        return NextResponse.json({ error: 'Servicio de automatización no configurado en el servidor.' }, { status: 500 });
    }
    console.log('[API /trigger-test-creation] Clave de API interna encontrada.');

    if (!process.env.NEXT_PUBLIC_BASE_URL || !adminDb) {
        console.error('[API /trigger-test-creation] NEXT_PUBLIC_BASE_URL or adminDb is not configured.');
        return NextResponse.json({ error: 'Error de configuración del servidor.' }, { status: 500 });
    }

    try {
        const timestamp = Date.now();
        const storeData = {
            storeName: `Tienda de Prueba ${timestamp}`,
            businessEmail: `test-${timestamp}@example.com`,
            countryCode: "ES",
            currency: "EUR",
            brandDescription: "Una tienda de prueba generada automáticamente para verificar el flujo de creación de AutoPress AI.",
            targetAudience: "Desarrolladores y equipo de producto.",
            brandPersonality: "Funcional, robusta y eficiente.",
            legalBusinessName: "AutoPress Testing SL",
            businessAddress: "Calle Ficticia 123, 08001, Barcelona, España"
        };
        console.log('[API /trigger-test-creation] Datos de la tienda de prueba generados.');

        const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
        if (companyQuery.empty) {
            throw new Error("La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos.");
        }
        const ownerCompanyId = companyQuery.docs[0].id;
        console.log(`[API /trigger-test-creation] ID de empresa propietaria encontrado: ${ownerCompanyId}`);

        const jobPayload = {
          webhookUrl: "https://webhook.site/#!/view/1b8a9b3f-8c3b-4c1e-9d2a-9e1b5f6a7d1c", 
          storeName: storeData.storeName,
          businessEmail: storeData.businessEmail,
          countryCode: storeData.countryCode,
          currency: storeData.currency,
          brandDescription: storeData.brandDescription,
          targetAudience: storeData.targetAudience,
          brandPersonality: storeData.brandPersonality,
          productTypeDescription: 'Productos de ejemplo para tienda nueva',
          creationOptions: {
            createExampleProducts: true,
            numberOfProducts: 3,
            createAboutPage: true,
            createContactPage: true,
            createLegalPages: true,
            createBlogWithPosts: true,
            numberOfBlogPosts: 2,
            setupBasicNav: true,
            theme: "dawn",
          },
          legalInfo: {
            legalBusinessName: storeData.legalBusinessName,
            businessAddress: storeData.businessAddress,
          },
          entity: {
            type: 'company' as 'company' | 'user',
            id: ownerCompanyId,
          }
        };

        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`;
        console.log(`[API /trigger-test-creation] Llamando a la API pública en ${targetUri}`);
        
        const response = await axios.post(targetUri, jobPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`,
            }
        });
        
        console.log(`[API /trigger-test-creation] La API pública respondió con estado ${response.status}.`);

        // Forward the successful response from the public API
        return NextResponse.json(response.data, { status: response.status });

    } catch (error: any) {
        let errorMessage = 'An unknown error occurred.';
        let statusCode = 500;

        if (error instanceof AxiosError) {
            statusCode = error.response?.status || 500;
            errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        
        console.error(`[API /trigger-test-creation] Error capturado: ${errorMessage}`);
        return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
}
