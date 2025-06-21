
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { generateProductDescription, type GenerateProductDescriptionInput } from '@/ai/flows/generate-product-description';

export async function POST(req: NextRequest) {
  console.log('/api/generate-description: POST request received.');

  // 1. Fast fail if the Google AI API Key is not configured on the server.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('/api/generate-description: CRITICAL: GOOGLE_API_KEY environment variable is not set.');
    return NextResponse.json(
      { 
        error: 'Error de Configuración del Servidor',
        message: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // 2. Authenticate the user via Firebase Admin SDK.
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    console.error('/api/generate-description: Authentication token not provided.');
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
    console.log('/api/generate-description: User authenticated successfully.');
  } catch (error) {
    console.error("/api/generate-description: Error verifying Firebase token:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.', message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  // 3. Process the request by calling the AI flow.
  try {
    const body: GenerateProductDescriptionInput = await req.json();
    console.log('/api/generate-description: Request body parsed. Calling generateProductDescription flow with:', body);

    const result = await generateProductDescription(body);
    
    console.log('/api/generate-description: Flow completed successfully. Sending response to client.');
    return NextResponse.json(result);

  } catch (error: any) {
    // This is the most important log. It will capture the error before Next.js hides it.
    console.error('--- CRITICAL ERROR in /api/generate-description POST handler ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    if (error.cause) {
        console.error('Error Cause:', error.cause);
    }
    console.error('--- END OF CRITICAL ERROR ---');
    
    // Ensure a JSON response is always sent, even on failure.
    const errorMessage = error.cause?.root?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json(
      {
        error: 'Error Interno del Servidor',
        message: `Ocurrió un error en el servidor. Revisa los logs para más detalles. Mensaje: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
