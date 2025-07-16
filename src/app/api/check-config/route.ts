
// src/app/api/check-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type * as admin from 'firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

async function verifyPluginStatus(wpApi: AxiosInstance | null): Promise<{ isActive: boolean; error?: string }> {
  if (!wpApi) {
    return { isActive: false, error: 'WordPress API not configured.' };
  }

  try {
    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
    if (!siteUrl) {
      throw new Error("Could not determine base site URL.");
    }
    const statusEndpoint = `${siteUrl}/wp-json/custom/v1/status`;
    console.log(`[Plugin Check] Attempting to verify plugin via status endpoint: ${statusEndpoint}`);
    
    // This custom endpoint should exist if the plugin is active.
    const response = await wpApi.get(statusEndpoint);

    if (response.data?.verified === true) {
        console.log(`[Plugin Check] SUCCESS for ${siteUrl}. Plugin is active and verified.`);
        return { isActive: true };
    } else {
        const reason = response.data?.message || 'La respuesta del plugin no fue de éxito.';
        console.log(`[Plugin Check] FAILED for ${siteUrl}. Reason: ${reason}`);
        return { isActive: false, error: reason };
    }
  } catch (error: any) {
    const status = error.response?.status;
    let reason = 'Error de comunicación con el sitio WordPress.';
    if (status === 404) {
        reason = 'No se encontró el endpoint /custom/v1/status. Asegúrate de que el plugin "AutoPress AI Helper" está instalado y activo en tu WordPress.';
    } else if (status) {
        reason = `El sitio respondió con un error ${status}. Revisa la URL y la configuración de seguridad.`;
    }
    console.error(`[Plugin Check] FAILED for ${wpApi.defaults.baseURL}. Status: ${status}. Raw Error:`, error.message);
    return { isActive: false, error: reason };
  }
}

async function verifyBaseWpConnection(wpApi: AxiosInstance | null): Promise<boolean> {
    if (!wpApi) return false;
    try {
        // A simple GET request to the base of the API is enough to check credentials and reachability.
        // We use /users endpoint as it's a standard one.
        await wpApi.get('/users?context=view&per_page=1');
        return true;
    } catch (error) {
        console.warn("Base WP connection check failed.", error);
        return false;
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
        userConfig.wordPressConfigured = await verifyBaseWpConnection(wpApi); 
        userConfig.shopifyConfigured = !!(activeConnection.shopifyStoreUrl && activeConnection.shopifyApiPassword);
        
        const wooUrl = activeConnection.wooCommerceStoreUrl || activeConnection.wordpressApiUrl;
        activeStoreUrl = wooUrl || activeConnection.shopifyStoreUrl || null;

        if (userConfig.shopifyConfigured) {
          activePlatform = 'shopify';
        } else if (userConfig.wooCommerceConfigured || userConfig.wordPressConfigured) {
          activePlatform = 'woocommerce';
        }

        // Only check for the plugin if the base WP connection is successful.
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
  
  const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
  userConfig.aiUsageCount = userSettingsDoc.data()?.aiUsageCount || 0;


  const finalConfigStatus = {
    ...globalConfig,
    ...userConfig,
    activeStoreUrl: activeStoreUrl,
    activePlatform: activePlatform,
    assignedPlatform: assignedPlatform,
  };

  return NextResponse.json(finalConfigStatus);
}
