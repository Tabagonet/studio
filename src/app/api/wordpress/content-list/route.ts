
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
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
      throw new Error('WordPress API is not configured for the active connection.');
    }

    // New logic: Call the custom endpoint which is more efficient
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/content-list`;

    const response = await wpApi.get(customEndpointUrl);

    // The custom endpoint already returns the data in the desired format
    return NextResponse.json({ content: response.data.content });

  } catch (error: any) {
    let errorMessage = 'Failed to fetch content list.';
    let status = error.response?.status || 500;

    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }
    
    if (error.response?.status === 404) {
      errorMessage = 'Endpoint /custom/v1/content-list no encontrado. Por favor, actualiza el plugin "AutoPress AI Helper" en tu WordPress a la última versión.';
    }
    
    console.error(`[API /content-list] Critical error: ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
