// src/app/api/generate-description/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import {
  generateProductDescription,
  GenerateProductDescriptionInputSchema
} from '@/ai/flows/generate-product-description';

// This API route handler is now a clean wrapper around the AI flow.
export async function POST(req: NextRequest) {
  // A. Fast fail if GOOGLE_API_KEY is not set.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('CRITICAL: GOOGLE_API_KEY environment variable is not set.');
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
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.', message: 'Tu sesión ha expirado. Por favor, inicia sesión de nuevo.' }, { status: 401 });
  }

  // C. Process the request by calling the dedicated flow.
  try {
    const body = await req.json();

    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', message: 'Los datos enviados no tienen el formato correcto.', details: validatedBody.error.format() }, { status: 400 });
    }

    // Call the dedicated, imported flow function.
    const descriptions = await generateProductDescription(validatedBody.data);
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    // This enhanced error handling provides more specific details to the client.
    console.error('--- FULL ERROR in /api/generate-description POST handler ---');
    console.error(error);
    console.error('--- END OF FULL ERROR ---');
    
    // Extract the most specific error message possible.
    const errorMessage = error.cause?.root?.message || error.message || 'Ocurrió un error desconocido al generar la descripción.';

    return NextResponse.json(
      {
        error: 'Error al comunicarse con la IA',
        message: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
