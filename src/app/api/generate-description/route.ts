
// src/app/api/generate-description/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import {
  generateProductDescription,
  GenerateProductDescriptionInputSchema
} from '@/ai/flows/generate-product-description';

// This API route handler is now a clean wrapper around the AI flow.
export async function POST(req: NextRequest) {
  console.log('/api/generate-description: POST request received.');

  // A. Fast fail if GOOGLE_API_KEY is not set.
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

  // B. Authenticate the user.
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

  // C. Process the request by calling the dedicated flow.
  try {
    const body = await req.json();
    console.log('/api/generate-description: Request body parsed.');

    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      console.error('/api/generate-description: Invalid request body:', validatedBody.error.format());
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', message: 'Los datos enviados no tienen el formato correcto.', details: validatedBody.error.format() }, { status: 400 });
    }
    console.log('/api/generate-description: Request body validated. Calling generateProductDescription flow.');

    // Call the dedicated, imported flow function.
    const descriptions = await generateProductDescription(validatedBody.data);
    console.log('/api/generate-description: Flow executed successfully. Sending response.');
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    // This is the most important log. It will capture the error before Next.js turns it into an HTML page.
    console.error('--- CRITICAL ERROR in /api/generate-description POST handler ---');
    console.error('Error Name:', error.name);
    console.error('Error Message:', error.message);
    console.error('Error Stack:', error.stack);
    if (error.cause) {
        console.error('Error Cause:', error.cause);
    }
    console.error('--- END OF CRITICAL ERROR ---');
    
    // Extract the most specific error message possible.
    const errorMessage = error.cause?.root?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';

    return NextResponse.json(
      {
        error: 'Error Interno del Servidor',
        message: `Ocurrió un error en el servidor. Revisa los logs del servidor para más detalles. Mensaje: ${errorMessage}`,
        // Don't send the stack to the client in production, but it's useful for debugging here.
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
