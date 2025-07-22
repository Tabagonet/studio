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
    
    // The custom endpoint is at the root of the site, not under /wp-json/wp/v2
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');

    if (!siteUrl) {
        throw new Error("Could not determine the base site URL from the WordPress API configuration.");
    }
    
    const menuResponse = await wpApi.get(`${siteUrl}/wp-json/custom/v1/menus`);
    
    return NextResponse.json(menuResponse.data);

  } catch (error: any) {
    let errorMessage = 'Failed to fetch menu structure.';
    let status = error.response?.status || 500;
    
    if (error.response?.status === 404) {
        // This is an expected "error" if the user hasn't added the custom PHP snippet.
        // We return an empty array so the UI can gracefully fall back to the next hierarchy method.
        console.log("Menu endpoint not found (404), returning empty array for fallback.");
        return NextResponse.json([]);
    } 
    
    if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
    } else if (error.message) {
        errorMessage = error.message;
    }

    if (error.message && error.message.includes('not configured')) {
        status = 400;
    }
    
    console.error(`Menu API Error (${status}): ${errorMessage}`);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
