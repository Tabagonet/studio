// src/app/api/wordpress/menu/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const { wpApi, nonce } = await getApiClientsForUser(uid);
    if (!wpApi) {
        // If WP is not configured, it's not an "error", but there are no menus.
        return NextResponse.json([]);
    }

    const headers: Record<string, string> = {};
    if (nonce) {
        headers['X-WP-Nonce'] = nonce;
    } else {
        throw new Error('Falta el encabezado de nonce.');
    }
    
    const customEndpointUrl = `/custom/v1/menus`;

    const response = await wpApi.get(customEndpointUrl, { headers });
    
    // Ensure the response is an array, even if the plugin returns something unexpected.
    if (response.data && Array.isArray(response.data)) {
      return NextResponse.json(response.data);
    } else {
      console.warn("Invalid or empty response from get-menus endpoint, returning empty array.");
      return NextResponse.json([]);
    }

  } catch (error: any) {
    console.error('Error fetching WordPress menus:', error.response?.data || error.message);
    // Always return an empty array on error to prevent frontend crashes.
    // The UI can then show a "not found" or "error" state based on the empty array.
    return NextResponse.json([]);
  }
}
