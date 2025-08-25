
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
        console.warn('WordPress API not configured, returning empty array.');
        return NextResponse.json([]);
    }
    
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      console.warn('Invalid site URL, returning empty array.');
      return NextResponse.json([]);
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;

    const response = await wpApi.get(customEndpointUrl);
    
    if (response.data && Array.isArray(response.data)) {
      if (response.data.every(item => typeof item === 'object' && item !== null && 'code' in item && 'name' in item)) {
        return NextResponse.json(response.data);
      } else {
        console.warn("Invalid response format from get-languages endpoint, returning empty array.");
        return NextResponse.json([]);
      }
    } else if (response.data?.code) {
        console.warn(`Plugin error: ${response.data.code} - ${response.data.message}`);
        return NextResponse.json([]);
    } else {
      console.warn("Invalid or empty response from get-languages endpoint, returning empty array.");
      return NextResponse.json([]);
    }

  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
    console.error(`Error fetching Polylang languages, returning empty array. Reason: ${errorMessage}`);
    // Always return an empty array on error to prevent the client from crashing.
    // The UI should handle the empty array gracefully.
    return NextResponse.json([]);
  }
}
