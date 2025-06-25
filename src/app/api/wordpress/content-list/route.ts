

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
      throw new Error('WordPress API is not configured for the active connection.');
    }
    
    // The custom endpoint is at the root of the site, not under /wp-json/wp/v2
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
        throw new Error("Could not determine the base site URL from the WordPress API configuration.");
    }

    // Call the new, high-performance custom endpoint from the plugin
    const response = await wpApi.get(`${siteUrl}/wp-json/custom/v1/content-list`);
    
    // The custom endpoint already returns the data in the desired format.
    return NextResponse.json(response.data);

  } catch (error: any) {
    let errorMessage = 'Failed to fetch content list.';
    let status = error.response?.status || 500;

    if (error.response?.status === 404) {
        errorMessage = 'Endpoint de listado de contenido no encontrado. Por favor, actualiza el plugin personalizado en WordPress a la última versión.';
    } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
