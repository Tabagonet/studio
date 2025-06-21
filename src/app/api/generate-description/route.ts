
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { generateProductDescription, type GenerateProductDescriptionInput } from '@/ai/flows/generate-product-description';

export async function POST(req: NextRequest) {
  // Check for API Key first, to provide a better error message.
  if (!process.env.GOOGLE_API_KEY) {
    console.error('Google AI API Key (GOOGLE_API_KEY) is not configured in the environment.');
    return NextResponse.json(
      { 
        success: false, 
        error: 'La clave API de Google AI no está configurada en el servidor. Por favor, añádela al archivo .env y reinicia la aplicación. Puedes obtener una clave en Google AI Studio.' 
      }, 
      { status: 503 } // Service Unavailable
    );
  }

  // 1. Authenticate the user
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ success: false, error: 'No se proporcionó token de autenticación.' }, { status: 401 });
  }

  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase en /api/generate-description:", error);
    return NextResponse.json({ success: false, error: 'Token de autenticación inválido o expirado.' }, { status: 401 });
  }

  // 2. Get data and call the Genkit flow
  try {
    const body: GenerateProductDescriptionInput = await req.json();

    if (!body.productName) {
        return NextResponse.json({ success: false, error: 'El nombre del producto es requerido.' }, { status: 400 });
    }

    const descriptions = await generateProductDescription(body);
    
    return NextResponse.json(descriptions);

  } catch (error: any) {
    console.error('Error al llamar al flujo de Genkit para generar descripción:', error);
    const errorMessage = error.message || 'Ocurrió un error desconocido al generar la descripción.';
    return NextResponse.json({ success: false, error: `Error de IA: ${errorMessage}` }, { status: 500 });
  }
}
