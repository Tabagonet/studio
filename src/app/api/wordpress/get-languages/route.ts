
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    console.log('[API get-languages] Request received.');
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            console.error('[API get-languages] Auth token missing.');
            return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
        }

        if (!adminAuth) {
            console.error('[API get-languages] Firebase Admin Auth not initialized.');
            throw new Error('Firebase Admin Auth is not initialized.');
        }

        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        console.log(`[API get-languages] User authenticated: ${uid}`);

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi || !wpApi.defaults.baseURL) {
            console.warn('[API get-languages] WordPress API not configured or invalid baseURL.');
            return NextResponse.json([]);
        }
        
        const siteUrl = wpApi.defaults.baseURL.replace('/wp-json/wp/v2', '');
        const customEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;
        console.log(`[API get-languages] Calling custom endpoint: ${customEndpointUrl}`);

        const response = await wpApi.get(customEndpointUrl);
        
        console.log(`[API get-languages] Received status ${response.status} from WordPress.`);

        if (response.data?.code === 'polylang_not_found') {
            const errorMessage = `Polylang not active on remote site. Plugin message: ${response.data.message}`;
            console.error(`[API get-languages] CRITICAL ERROR fetching Polylang languages:`, response.data);
            throw new Error(response.data.message);
        }

        if (response.data && Array.isArray(response.data)) {
            if (response.data.every(item => typeof item === 'object' && item !== null && 'code' in item && 'name' in item)) {
                console.log(`[API get-languages] Success. Returning ${response.data.length} languages.`);
                return NextResponse.json(response.data);
            } else {
                console.warn("[API get-languages] Invalid response format from get-languages endpoint, returning empty array. Data:", JSON.stringify(response.data));
                return NextResponse.json([]);
            }
        } else {
            console.warn("[API get-languages] Invalid or empty response from get-languages endpoint, returning empty array. Data:", JSON.stringify(response.data));
            return NextResponse.json([]);
        }
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error occurred';
        console.error(`[API get-languages] CRITICAL ERROR in catch block: ${errorMessage}`, error.response?.data);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

    