
// src/app/api/check-config/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type * as admin from 'firebase-admin';
import axios from 'axios';
import { partnerAppConnectionDataSchema } from '@/lib/api-helpers';

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
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');
    const targetCompanyId = searchParams.get('companyId');

    let settingsSource: admin.firestore.DocumentData | undefined;
    
    // Determine the source of settings based on the request context
    if (userRole === 'super_admin' && (targetUserId || targetCompanyId)) {
        // Super admin is explicitly checking a specific entity
        const entityId = targetCompanyId || targetUserId;
        const collection = targetCompanyId ? 'companies' : 'user_settings';
        const doc = await adminDb.collection(collection).doc(entityId!).get();
        settingsSource = doc.exists ? doc.data() : undefined;
    } else {
        // Regular user or admin: Use their assigned company or personal settings
        if (userCompanyId) {
            const companyDoc = await adminDb.collection('companies').doc(userCompanyId).get();
            settingsSource = companyDoc.exists ? companyDoc.data() : undefined;
        }
        // Fallback to personal settings if no company or company doc not found
        if (!settingsSource) {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
            settingsSource = userSettingsDoc.exists ? userSettingsDoc.data() : undefined;
        }
    }
    
    // Fetch global partner settings separately
    const globalSettingsDoc = await adminDb.collection('companies').doc('global_settings').get();
    const globalSettingsSource = globalSettingsDoc.exists ? globalSettingsDoc.data() : undefined;
    
    // Process logged-in user AI usage
    const loggedInUserSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    if (loggedInUserSettingsDoc.exists) {
        userConfig.aiUsageCount = loggedInUserSettingsDoc.data()?.aiUsageCount || 0;
    }
    
    // Process partner credentials from global settings
    if (globalSettingsSource) {
      const partnerAppData = partnerAppConnectionDataSchema.safeParse(globalSettingsSource.connections?.partner_app || {});
      userConfig.shopifyCustomAppConfigured = !!(partnerAppData.success && partnerAppData.data.clientId && partnerAppData.data.clientSecret);
      if (partnerAppData.success && partnerAppData.data.partnerApiToken && partnerAppData.data.organizationId) {
          userConfig.shopifyPartnerConfigured = true;
      }
    }

    // Process user/company specific connections
    if (settingsSource) {
      if (settingsSource.platform) {
        assignedPlatform = settingsSource.platform;
      } else {
        const userSettings = (await adminDb.collection('user_settings').doc(uid).get()).data();
        assignedPlatform = userSettings?.platform || null;
      }

      const allConnections = settingsSource.connections || {};
      const activeKey = settingsSource.activeConnectionKey;
      
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
          const { wordpressApiUrl: url, wordpressUsername: username, wordpressApplicationPassword: applicationPassword } = activeConnection;
          const token = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
          
          const siteUrl = `https://${new URL(url).hostname}`;
          const statusEndpoint = `${siteUrl}/wp-json/custom/v1/status`;

          try {
            const response = await axios.get(statusEndpoint, {
              headers: { 'Authorization': `Basic ${token}` },
              timeout: 10000,
            });
            if (response.status === 200 && response.data?.verified === true) {
              userConfig.pluginActive = true;
            }
          } catch (pluginError: any) {
            console.warn(`Plugin status check failed for ${url}:`, pluginError.message);
            userConfig.pluginActive = false;
            
            // Set a specific error message for easier debugging on the frontend
            if (pluginError.response && pluginError.response.status === 404) {
                 userConfig.pluginError = 'No se encontró el endpoint del plugin. Asegúrate de que el plugin "AutoPress AI Helper" está instalado, activado y es la última versión.';
            } else {
                 userConfig.pluginError = 'No se pudo verificar el plugin. Revisa las credenciales y la conectividad.';
            }

            // Fallback Check: If the primary endpoint fails, check for a known Polylang endpoint.
            // This suggests the base API is working but our custom endpoint is not.
            try {
                const polylangCheckEndpoint = `${siteUrl}/wp-json/polylang/v1/languages`;
                await axios.get(polylangCheckEndpoint, { headers: { 'Authorization': `Basic ${token}` }, timeout: 5000 });
                // If this succeeds, it means the API is responsive but our endpoint is missing.
                userConfig.pluginError = 'El plugin "AutoPress AI Helper" no se ha encontrado o no está actualizado. Por favor, instálalo desde src/lib/wordpress-plugin.php.';
            } catch (polylangError) {
                // If this also fails, it's likely a more general connection or credentials issue.
                // The original, less specific error message is probably fine in this case.
                 console.warn(`Polylang fallback check also failed for ${url}.`);
            }
          }
        }
      }
    }

  } catch (dbError) {
      console.error("Firestore error in /api/check-config:", dbError);
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
