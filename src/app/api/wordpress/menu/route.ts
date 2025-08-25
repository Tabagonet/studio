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
        // If WP is not configured, it's not an "error", but there are no menus.
        return NextResponse.json([]);
    }
    
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/menus`;

    const response = await wpApi.get(customEndpointUrl);
    
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
