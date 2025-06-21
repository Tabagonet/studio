
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { generateProductDescription, GenerateProductDescriptionInputSchema } from '@/ai/flows/generate-product-description';

// --- API Route Handler ---

export async function POST(req: NextRequest) {
  // 1. Check for API Key first for a fast failure and clear error message.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('CRITICAL: GOOGLE_API_KEY environment variable is not set.');
    return NextResponse.json(
      { 
        error: 'Error de Configuración',
        message: 'La clave API de Google AI no está configurada en el servidor. Contacta al administrador.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // 2. Authenticate the user.
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

  // 3. Process the request.
  try {
    const body = await req.json();

    // Validate input against the Zod schema imported from the flow file.
    const validatedBody = GenerateProductDescriptionInputSchema.safeParse(body);
    if (!validatedBody.success) {
      return NextResponse.json({ error: 'Cuerpo de la petición inválido.', message: 'Los datos enviados a la API no tienen el formato correcto.', details: validatedBody.error.format() }, { status: 400 });
    }

    // Call the isolated server action.
    const descriptions = await generateProductDescription(validatedBody.data);
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    console.error('--- FULL ERROR in /api/generate-description POST handler ---');
    console.error(error);
    console.error('--- END OF FULL ERROR ---');

    // Attempt to extract a more specific error message from nested error objects.
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
