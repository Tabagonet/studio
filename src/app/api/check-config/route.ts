
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  // Authentication
  const token = req.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ error: 'No se proporcionó token de autenticación.' }, { status: 401 });
  }
  try {
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error al verificar el token de Firebase:", error);
    return NextResponse.json({ error: 'Token de autenticación inválido o expirado.' }, { status: 401 });
  }

  // Check environment variables
  const configStatus = {
    googleAiApiKey: !!process.env.GOOGLE_API_KEY,
    wooCommerceStoreUrl: !!process.env.WOOCOMMERCE_STORE_URL,
    wooCommerceApiKey: !!process.env.WOOCOMMERCE_API_KEY,
    wooCommerceApiSecret: !!process.env.WOOCOMMERCE_API_SECRET,
    firebaseAdminSdk: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (!!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_PRIVATE_KEY && !!process.env.FIREBASE_CLIENT_EMAIL),
  };

  return NextResponse.json(configStatus);
}
