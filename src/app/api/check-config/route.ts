
// src/app/api/check-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type * as admin from 'firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

async function verifyPluginStatus(wpApi: any): Promise<{ isActive: boolean; error?: string }> {
  if (!wpApi) return { isActive: false, error: 'WordPress API not configured.' };

  const adminAjaxUrl = `${wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '/admin-ajax.php')}`;
  console.log(`[Plugin Check] Attempting to verify plugin via admin-ajax: ${adminAjaxUrl}`);
  
  try {
    const response = await wpApi.post(adminAjaxUrl, new URLSearchParams({
      action: 'autopress_ai_verify_status'
    }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    if (response.data?.success && response.data?.data?.verified) {
      console.log(`[Plugin Check] SUCCESS for ${wpApi.defaults.baseURL}. Plugin is active and verified.`);
      return { isActive: true };
    } else {
      const reason = response.data?.data?.message || 'La respuesta del plugin no fue de éxito o no está verificado.';
      console.log(`[Plugin Check] FAILED for ${wpApi.defaults.baseURL}. Status: ${response.status}. Reason: ${reason}`);
      return { isActive: false, error: reason };
    }
  } catch (error: any) {
    const status = error.response?.status;
    let reason = 'Error de comunicación con el sitio WordPress.';
    if (status) {
        reason = `El sitio respondió con un error ${status}. Revisa la URL y la configuración de seguridad.`;
    }
    console.error(`[Plugin Check] FAILED for ${wpApi.defaults.baseURL}. Status: ${status}. Raw Error:`, error.message);
    return { isActive: false, error: reason };
  }
}

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
    pluginActive: false,
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
    const { wooApi, wpApi, shopifyApi, settings } = await getApiClientsForUser(uid);
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

        if (userConfig.wordPressConfigured) {
           const pluginCheck = await verifyPluginStatus(wpApi);
           userConfig.pluginActive = pluginCheck.isActive;
           userConfig.pluginError = pluginCheck.error;
        }
    }

  } catch (error: any) {
      console.log(`Config check failed for user ${uid}, likely due to no active connection. Error: ${error.message}`);
  }
  
  const partnerCreds = await getPartnerCredentials().catch(() => null);
  userConfig.shopifyPartnerConfigured = !!(partnerCreds && partnerCreds.partnerApiToken && partnerCreds.organizationId);
  userConfig.shopifyCustomAppConfigured = !!(partnerCreds && partnerCreds.clientId && partnerCreds.clientSecret);


  const finalConfigStatus = {
    ...globalConfig,
    ...userConfig,
    activeStoreUrl: activeStoreUrl,
    activePlatform: activePlatform,
    assignedPlatform: assignedPlatform,
  };

  return NextResponse.json(finalConfigStatus);
}
