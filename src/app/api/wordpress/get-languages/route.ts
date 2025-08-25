
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
            throw new Error('Firebase Admin Auth is not initialized.');
        }

        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;
        console.log(`[API get-languages] User authenticated: ${uid}`);

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi || !wpApi.defaults.baseURL) {
            console.warn('[API get-languages] WordPress API not configured or invalid baseURL.');
            return NextResponse.json([]);
        }

        const siteUrl = wpApi.defaults.baseURL.replace('/wp-json/wp/v2', '');
        const statusEndpointUrl = `${siteUrl}/wp-json/custom/v1/status`;
        const languagesEndpointUrl = `${siteUrl}/wp-json/custom/v1/get-languages`;

        // Verificar si Polylang está activo usando /status
        const statusResponse = await wpApi.get(statusEndpointUrl);
        console.log('[API get-languages] Status response:', JSON.stringify(statusResponse.data));
        if (!statusResponse.data?.polylang_active) {
            console.warn('[API get-languages] Polylang is not active according to /status endpoint.');
            return NextResponse.json([]);
        }

        // Obtener idiomas
        const response = await wpApi.get(languagesEndpointUrl);

        console.log(`[API get-languages] Received status ${response.status} from WordPress.`);

        if (response.data && Array.isArray(response.data)) {
            if (response.data.every(item => typeof item === 'object' && item !== null && 'code' in item && 'name' in item)) {
                console.log(`[API get-languages] Success. Returning ${response.data.length} languages.`);
                return NextResponse.json(response.data);
            } else {
                console.warn('[API get-languages] Invalid response format from get-languages:', JSON.stringify(response.data));
                return NextResponse.json([]);
            }
        } else if (response.data?.code) {
            console.warn(`[API get-languages] Plugin error: ${response.data.code} - ${response.data.message}`);
            return NextResponse.json([]);
        } else {
            console.warn('[API get-languages] Invalid or empty response from get-languages:', JSON.stringify(response.data));
            return NextResponse.json([]);
        }
    } catch (error: any) {
        const errorMessage = error.response?.data?.message || error.message || 'Unknown error';
        console.error(`[API get-languages] CRITICAL ERROR fetching Polylang languages: ${errorMessage}`, error.response?.data);
        return NextResponse.json([]);
    }
}
