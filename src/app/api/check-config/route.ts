
// src/app/api/check-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type * as admin from 'firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let uid: string;
  let userRole: string | null = null;
  let userCompanyId: string | null = null;

  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (userDoc.exists) {
        const userData = userDoc.data();
        userRole = userData?.role || null;
        userCompanyId = userData?.companyId || null;
    }
  } catch (error) {
    console.error("Auth error in /api/check-config:", error);
    return NextResponse.json({ error: 'Invalid or expired auth token.' }, { status: 401 });
  }

  const globalConfig = {
    googleAiApiKey: !!process.env.GOOGLE_API_KEY,
    firebaseAdminSdk: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (!!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_PRIVATE_KEY && !!process.env.FIREBASE_CLIENT_EMAIL),
    recaptchaConfigured: !!(process.env.RECAPTCHA_SECRET_KEY && process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY),
  };

  let userConfig: any = {
    wooCommerceConfigured: false,
    wordPressConfigured: false,
    shopifyConfigured: false,
    shopifyPartnerConfigured: false,
    shopifyCustomAppConfigured: false,
    pluginActive: false, // Default to false, will be updated if WP is configured.
    aiUsageCount: 0,
  };
  let activeStoreUrl: string | null = null;
  let activePlatform: 'woocommerce' | 'shopify' | null = null;
  let assignedPlatform: 'woocommerce' | 'shopify' | null = null;
  
  if (!adminDb) {
      console.warn("/api/check-config: Firestore is not available.");
      return NextResponse.json({ ...globalConfig, ...userConfig, activeStoreUrl: null, activePlatform: null, pluginActive: false, assignedPlatform: null });
  }

  try {
    const { wpApi, settings } = await getApiClientsForUser(uid);
    const allConnections = settings?.connections || {};
    const activeKey = settings?.activeConnectionKey;

    if (settings) {
        assignedPlatform = settings.platform || null;
    } else {
        const userSettings = (await adminDb.collection('user_settings').doc(uid).get()).data();
        assignedPlatform = userSettings?.platform || null;
    }
    
    if (activeKey && allConnections[activeKey]) {
        const activeConnection = allConnections[activeKey];
        userConfig.wooCommerceConfigured = !!(activeConnection.wooCommerceStoreUrl && activeConnection.wooCommerceApiKey && activeConnection.wooCommerceApiSecret);
        userConfig.wordPressConfigured = !!(activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword);
        userConfig.shopifyConfigured = !!(activeConnection.shopifyStoreUrl && activeConnection.shopifyApiPassword);
        activeStoreUrl = activeConnection.wooCommerceStoreUrl || activeConnection.wordpressApiUrl || activeConnection.shopifyStoreUrl || null;

        if (userConfig.shopifyConfigured) {
          activePlatform = 'shopify';
        } else if (userConfig.wooCommerceConfigured || userConfig.wordPressConfigured) {
          activePlatform = 'woocommerce';
        }

        // New robust check: If WordPress credentials exist, we assume the connection is valid for WP features.
        if (userConfig.wordPressConfigured) {
           userConfig.pluginActive = true; // Simplified assumption: if WP creds are present, we enable features.
        }
    }

  } catch (error: any) {
      console.log(`Config check failed for user ${uid}, likely due to no active connection. Error: ${error.message}`);
      // Don't throw an error, just return the default (unconfigured) state.
  }

  const finalConfigStatus = {
    ...globalConfig,
    ...userConfig,
    activeStoreUrl: activeStoreUrl,
    activePlatform: activePlatform,
    assignedPlatform: assignedPlatform,
  };

  return NextResponse.json(finalConfigStatus);
}
