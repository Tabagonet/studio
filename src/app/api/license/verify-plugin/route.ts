// src/app/api/license/verify-plugin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  apiKey: z.string().uuid("Formato de API Key inválido."),
  siteUrl: z.string().url("La URL del sitio proporcionada no es válida."),
});

// Helper to normalize URLs for comparison
const normalizeUrl = (url: string): string => {
  if (!url) return '';
  try {
    const urlObject = new URL(url.startsWith('http') ? url : `https://${url}`);
    // Remove www., trailing slash, and protocol
    return `${urlObject.hostname.replace(/^www\./, '')}${urlObject.pathname.replace(/\/$/, '')}`;
  } catch (e) {
    // Fallback for simple hostnames or invalid URLs
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
  }
};


export async function GET(req: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ status: 'error', message: 'Firestore no configurado en el servidor.' }, { status: 503 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const apiKey = searchParams.get('apiKey');
    const siteUrl = searchParams.get('siteUrl');

    const validation = verifySchema.safeParse({ apiKey, siteUrl });
    if (!validation.success) {
      const issues = validation.error.flatten();
      const errorMessage = issues.fieldErrors.apiKey?.[0] || issues.fieldErrors.siteUrl?.[0] || 'Datos de entrada inválidos.';
      return NextResponse.json({ status: 'error', message: errorMessage }, { status: 400 });
    }

    const { apiKey: validApiKey, siteUrl: validSiteUrl } = validation.data;
    
    // 1. Find user by API key using direct lookup
    const apiKeyRef = adminDb.collection('api_keys').doc(validApiKey);
    const apiKeyDoc = await apiKeyRef.get();
    
    if (!apiKeyDoc.exists) {
        return NextResponse.json({ status: 'inactive', message: 'API Key no válida o no encontrada.' }, { status: 403 });
    }
    
    const { userId: uid } = apiKeyDoc.data() as { userId: string };
    if (!uid) {
        return NextResponse.json({ status: 'error', message: 'API Key corrupta. Contacta con soporte.' }, { status: 500 });
    }
    
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) {
        return NextResponse.json({ status: 'inactive', message: 'La cuenta de usuario asociada no existe.' }, { status: 403 });
    }
    const userData = userDoc.data()!;

    // 2. Check user status
    if (userData.status !== 'active') {
      return NextResponse.json({ status: 'inactive', message: 'La cuenta de usuario no está activa.' }, { status: 403 });
    }

    // 3. Check site limit and if this site is registered
    const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    const settings = userSettingsDoc.data() || { connections: {} };
    const connections = settings.connections || {};
    const connectionCount = Object.keys(connections).length;
    const siteLimit = userData.siteLimit ?? 1;
    
    const normalizedSiteUrl = normalizeUrl(validSiteUrl);
    
    const isSiteRegistered = Object.values(connections).some((conn: any) => {
        const wooUrl = conn.wooCommerceStoreUrl ? normalizeUrl(conn.wooCommerceStoreUrl) : null;
        const wpUrl = conn.wordpressApiUrl ? normalizeUrl(conn.wordpressApiUrl) : null;
        return wooUrl === normalizedSiteUrl || wpUrl === normalizedSiteUrl;
    });

    if (isSiteRegistered) {
        return NextResponse.json({ status: 'active', message: 'Plugin verificado correctamente.' });
    }

    // If it's not registered, check if they have hit their limit.
    if (connectionCount < siteLimit) {
      return NextResponse.json({ status: 'inactive', message: 'Este sitio no está configurado en tu cuenta de AutoPress AI. Por favor, añádelo en Ajustes > Conexiones.' }, { status: 403 });
    } else {
      return NextResponse.json({ status: 'limit_reached', message: `Límite de sitios (${siteLimit}) alcanzado para tu cuenta.` }, { status: 403 });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Error verifying plugin license:", error);
    return NextResponse.json({ status: 'error', message: 'Error interno del servidor.' }, { status: 500 });
  }
}
