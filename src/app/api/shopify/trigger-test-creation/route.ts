
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';

// This is a secure endpoint that can only be called by authenticated users of this app.
// Its purpose is to securely access the internal API key and then call the public-facing store creation API.
export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
        }
        if (!adminAuth || !adminDb) {
            throw new Error("Firebase Admin not initialized.");
        }
        // Verify the user is a valid, authenticated user of this application
        await adminAuth.verifyIdToken(token);
        
        // --- Securely handle the internal API key ---
        const internalApiKey = process.env.SHOPIFY_AUTOMATION_API_KEY;
        if (!internalApiKey) {
            console.error('SERVER ERROR: SHOPIFY_AUTOMATION_API_KEY is not set.');
            return NextResponse.json({ error: 'Servicio de automatización no configurado en el servidor.' }, { status: 500 });
        }

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

        const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/create-store`;
        
        console.log(`[Secure Trigger] Calling public API endpoint: ${targetUri}`);
        
        const response = await axios.post(targetUri, jobPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${internalApiKey}`, // Use the internal key here
            }
        });

        // Forward the response from the public API back to the client action
        return NextResponse.json(response.data, { status: response.status });

    } catch (error: any) {
        console.error('[Secure Trigger Endpoint Error]', error.response?.data || error.message);
        const errorDetails = error.response?.data?.details?.message || error.response?.data?.error || error.message;
        const errorMessage = `No se pudo iniciar el trabajo: ${errorDetails}`;
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
