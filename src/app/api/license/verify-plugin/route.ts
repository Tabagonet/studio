
// src/app/api/license/verify-plugin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const verifySchema = z.object({
  apiKey: z.string().uuid(),
  siteUrl: z.string().url(),
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


export async function POST(req: NextRequest) {
  if (!adminDb) {
    return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
  }

  try {
    const body = await req.json();
    const validation = verifySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ status: 'error', message: 'API Key o URL del sitio no son válidos.', details: validation.error.flatten() }, { status: 400 });
    }

    const { apiKey, siteUrl } = validation.data;
    
    // 1. Find user by API key using direct lookup
    const apiKeyRef = adminDb.collection('api_keys').doc(apiKey);
    const apiKeyDoc = await apiKeyRef.get();
    
    if (!apiKeyDoc.exists) {
        return NextResponse.json({ status: 'inactive', message: 'API Key no válida.' }, { status: 403 });
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
    
    const normalizedSiteUrl = normalizeUrl(siteUrl);
    
    const isSiteRegistered = Object.values(connections).some((conn: any) => {
        const wooUrl = conn.wooCommerceStoreUrl ? normalizeUrl(conn.wooCommerceStoreUrl) : null;
        const wpUrl = conn.wordpressApiUrl ? normalizeUrl(conn.wordpressApiUrl) : null;
        return wooUrl === normalizedSiteUrl || wpUrl === normalizedSiteUrl;
    });

    if (isSiteRegistered) {
        return NextResponse.json({ status: 'active', message: 'Plugin verificado correctamente.' });
    }

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
