
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
        // If WP is not configured, it's not an "error" but there are no languages. Return empty array.
        return NextResponse.json([]);
    }
    
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      // If no URL, we can't proceed.
      return NextResponse.json([]);
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;

    const response = await wpApi.get(customEndpointUrl);
    
    if (response.data && Array.isArray(response.data)) {
      return NextResponse.json(response.data);
    } else {
      // If the response is not what we expect, return an empty array for safety.
      console.warn("Invalid response format from get-languages endpoint, returning empty array.");
      return NextResponse.json([]);
    }

  } catch (error: any) {
    // If ANY error occurs (404, auth error, etc.), we return an empty array.
    // The UI will show that no languages are available, which is functionally correct.
    console.error('Error fetching Polylang languages, returning empty array:', error.response?.data || error.message);
    return NextResponse.json([]);
  }
}
