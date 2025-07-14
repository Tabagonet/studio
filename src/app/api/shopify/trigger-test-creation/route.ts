
// src/app/api/shopify/trigger-test-creation/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';

// This is a secure, internal-only API route. Its job is to read the server-side
// secret key and then call the public-facing API endpoint with that key.
// This ensures the secret key is never exposed and is always available.
export async function POST(req: NextRequest) {
    // 1. Authenticate the user making the request from the app
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 });
        }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    // 2. Read the internal secret API key from server environment variables
    const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
    if (!internalApiKey) {
        console.error('SERVER ERROR: SHOPIFY_AUTOMATION_API_KEY is not set.');
        return NextResponse.json({ error: 'Servicio de automatización no configurado en el servidor.' }, { status: 500 });
    }

    if (!process.env.NEXT_PUBLIC_BASE_URL || !adminDb) {
        return NextResponse.json({ error: 'Error de configuración del servidor.' }, { status: 500 });
    }

    try {
        // 3. Construct the payload for the public creation API
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

        const companyQuery = await adminDb.collection('companies').where('name', '==', 'Grupo 4 alas S.L.').limit(1).get();
        if (companyQuery.empty) {
            throw new Error("La empresa propietaria 'Grupo 4 alas S.L.' no se encuentra en la base de datos.");
        }
        const ownerCompanyId = companyQuery.docs[0].id;

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

        // 4. Call the public-facing API with the secret key
        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`;
        const response = await axios.post(targetUri, jobPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`,
            }
        });

        // 5. Return the result to the original caller (the server action)
        return NextResponse.json(response.data, { status: response.status });

    } catch (error: any) {
        const errorDetails = error.response?.data?.details || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        console.error('[trigger-test-creation Error]', errorMessage);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
