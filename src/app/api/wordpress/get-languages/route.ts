

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
      throw new Error("Could not determine base site URL from WordPress API configuration.");
    }
    const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;

    const response = await wpApi.get(customEndpointUrl);
    
    // The plugin now correctly handles errors and returns WP_Error objects.
    // If the response is not OK, it means Polylang isn't active or there's another issue.
    if (response.data && Array.isArray(response.data)) {
       // Further validation to ensure the data has the correct shape
      if (response.data.every(item => typeof item === 'object' && item !== null && 'code' in item && 'name' in item)) {
        return NextResponse.json(response.data);
      } else {
        console.warn("Invalid response format from get-languages endpoint, returning empty array.");
        return NextResponse.json([]);
      }
    } else {
      // Handle cases where the endpoint returns a non-array response (like a WP_Error object from the plugin)
      if (response.data?.code) {
          console.warn(`Plugin reported an issue: ${response.data.message}`);
      } else {
          console.warn("Invalid or empty response from get-languages endpoint, returning empty array.");
      }
      return NextResponse.json([]);
    }

  } catch (error: any) {
    // This block will now catch errors from Axios (e.g., 404, 501 from WP_Error)
    // and other unexpected errors. In all cases, we return an empty array to the client
    // to prevent crashes, while logging the actual error on the server.
    const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
    console.error(`Error fetching Polylang languages, returning empty array. Reason: ${errorMessage}`);
    return NextResponse.json([]);
  }
}
