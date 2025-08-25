
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

    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }
    
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/menus`;

    const response = await wpApi.get(customEndpointUrl);
    
    if (response.data && Array.isArray(response.data)) {
      return NextResponse.json(response.data);
    } else {
      throw new Error("Invalid response format from get-menus endpoint.");
    }

  } catch (error: any) {
    console.error('Error fetching WordPress menus:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch menus.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    if (error.response?.status === 404) {
      return NextResponse.json([]); // Return empty array if the endpoint doesn't exist on the plugin
    }
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
