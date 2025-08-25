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

        const { wpApi } = await getApiClientsForUser(uid);
        
        if (!wpApi) {
             throw new Error('WordPress API is not configured for the active connection.');
        }

        // The custom endpoint /custom/v1/get-languages has its permission_callback set to __return_true,
        // so we don't need a nonce or secret key header here anymore.
        const response = await wpApi.get('/custom/v1/get-languages');

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
