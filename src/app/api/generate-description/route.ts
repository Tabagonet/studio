
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser, generateProductContent, GenerateProductDescriptionInputSchema } from '@/lib/api-helpers';


export async function POST(req: NextRequest) {
  console.log('--- /api/generate-description: POST request received ---');

  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      console.error('/api/generate-description: Authentication token not provided.');
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
    console.log('/api/generate-description: User authenticated successfully with UID:', uid);
  } catch (error: any) {
     return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validationResult = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validationResult.success) {
      console.error('/api/generate-description: Invalid request body:', validationResult.error.flatten());
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    const inputData = validationResult.data;
    console.log('/api/generate-description: Request body parsed and validated:', inputData);

    const { wooApi } = await getApiClientsForUser(uid);
    // For this endpoint, wooApi is optional for the AI but required for grouped products.
    // The generateProductContent function will handle the case where it's null.

    const generatedContent = await generateProductContent(inputData, uid, wooApi);
    
    console.log('/api/generate-description: Successfully generated and validated descriptions.');
    return NextResponse.json(generatedContent);

  } catch (error: any) {
    console.error('--- CRITICAL ERROR in /api/generate-description ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    if (error.response) {
        console.error('API Response Error:', JSON.stringify(error.response, null, 2));
    }
    console.error('Error Stack:', error.stack);
        
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ error: 'Error Interno del Servidor', message: `Ocurrió un error en el servidor. Mensaje: ${errorMessage}` }, { status: 500 });
  }
}
