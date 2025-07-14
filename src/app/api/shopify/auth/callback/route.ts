
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validateHmac, getPartnerAppCredentials } from '@/lib/api-helpers';
import axios from 'axios';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const hmac = searchParams.get('hmac');
    const shop = searchParams.get('shop');
    const state = searchParams.get('state');

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
    if (!baseUrl) {
        throw new Error("NEXT_PUBLIC_BASE_URL is not set in environment variables.");
    }
    const settingsUrl = new URL('/settings/connections', baseUrl);

    // Security check
    if (!hmac || !validateHmac(searchParams, process.env.SHOPIFY_CLIENT_SECRET!)) {
        console.error("Shopify callback HMAC validation failed.");
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', 'HMAC validation failed. Security check failed.');
        return NextResponse.redirect(settingsUrl);
    }

    if (!code || !shop || !state) {
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', 'Missing required parameters from Shopify callback.');
        return NextResponse.redirect(settingsUrl);
    }
    
    const [entityType, entityId] = state.split(':');
    if ((entityType !== 'user' && entityType !== 'company') || !entityId) {
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', 'Invalid state parameter received from Shopify.');
        return NextResponse.redirect(settingsUrl);
    }

    try {
        const { clientId, clientSecret } = await getPartnerAppCredentials(entityId, entityType as 'user' | 'company');

        const accessTokenUrl = `https://${shop}/admin/oauth/access_token`;
        const response = await axios.post(accessTokenUrl, {
            client_id: clientId,
            client_secret: clientSecret,
            code,
        });

        const accessToken = response.data.access_token;
        if (!accessToken) {
            throw new Error('Access token not received from Shopify.');
        }

        // Save the access token securely to the user/company settings
        if (!adminDb) throw new Error('Firestore not configured.');

        const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
        const settingsRef = adminDb.collection(settingsCollection).doc(entityId);
        
        await settingsRef.set({
            partnerApiToken: accessToken,
            partnerShopDomain: shop,
        }, { merge: true });

        settingsUrl.searchParams.set('shopify_auth', 'success');
        return NextResponse.redirect(settingsUrl);

    } catch (error: any) {
        const errorMessage = error.response?.data?.error_description || error.message || 'Unknown error during token exchange.';
        console.error("Error exchanging code for access token:", errorMessage);
        settingsUrl.searchParams.set('shopify_auth', 'error');
        settingsUrl.searchParams.set('error_message', encodeURIComponent(errorMessage));
        return NextResponse.redirect(settingsUrl);
    }
}
