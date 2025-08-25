// src/app/api/wordpress/get-languages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    console.log('[API get-languages] Request received.');
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            console.error('[API get-languages] Auth token missing.');
            return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
        }

        if (!adminAuth) {
            console.error('[API get-languages] Firebase Admin Auth not initialized.');
            return NextResponse.json({ error: 'Firebase Admin Auth not initialized.' }, { status: 500 });
        }

        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;
        console.log(`[API get-languages] User authenticated: ${uid}`);

        const { wpApi, nonce } = await getApiClientsForUser(uid);
        if (!wpApi || !wpApi.defaults.baseURL) {
            console.error('[API get-languages] WordPress API not configured or invalid baseURL.');
            return NextResponse.json({ error: 'WordPress API is not configured or the URL is invalid.' }, { status: 500 });
        }

        const siteUrl = wpApi.defaults.baseURL.replace('/wp-json/wp/v2', '');
        const statusEndpointUrl = `${siteUrl}/wp-json/custom/v1/status`;
        const languagesEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;

        let statusResponse;
        try {
            statusResponse = await wpApi.get(statusEndpointUrl);
            console.log('[API get-languages] Status response:', JSON.stringify(statusResponse.data));
        } catch (error: any) {
            console.error('[API get-languages] Error fetching /status:', error.message, error.response?.data);
            return NextResponse.json({ error: `Failed to fetch status endpoint: ${error.message}` }, { status: 502 });
        }

        if (!statusResponse.data?.polylang_active) {
            console.warn('[API get-languages] Polylang is not active according to /status endpoint.');
            return NextResponse.json({ error: 'Polylang no está activo en el sitio de WordPress.' }, { status: 501 });
        }
        
        if (!nonce) {
            console.error('[API get-languages] Nonce is missing. Cannot call protected endpoint.');
            return NextResponse.json({ error: 'Failed to retrieve security nonce. Check WordPress credentials and permissions.' }, { status: 403 });
        }

        const response = await wpApi.get(languagesEndpointUrl, {
            headers: { 'X-WP-Nonce': nonce },
        });

        console.log(`[API get-languages] Received status ${response.status} from WordPress.`);

        if (response.data && Array.isArray(response.data)) {
            if (response.data.every(item => typeof item === 'object' && item !== null && 'code' in item && 'name' in item)) {
                console.log(`[API get-languages] Success. Returning ${response.data.length} languages.`);
                return NextResponse.json(response.data);
            } else {
                console.error('[API get-languages] Invalid response format from get-languages:', JSON.stringify(response.data));
                return NextResponse.json({ error: 'Invalid response format from WordPress plugin.' }, { status: 502 });
            }
        } else {
            console.error('[API get-languages] Invalid or empty response:', JSON.stringify(response.data));
            return NextResponse.json({ error: 'Invalid or empty response from WordPress plugin.' }, { status: 502 });
        }

    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        console.error(`[API get-languages] CRITICAL ERROR fetching Polylang languages: ${errorMessage}`, error.response?.data);
        return NextResponse.json({ error: errorMessage, details: error.response?.data }, { status: 500 });
    }
}
