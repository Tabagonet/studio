
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
    
    if (userRole === 'super_admin' && (targetUserId || targetCompanyId)) {
        const entityId = targetCompanyId || targetUserId;
        const collection = targetCompanyId ? 'companies' : 'user_settings';
        const doc = await adminDb.collection(collection).doc(entityId!).get();
        settingsSource = doc.exists ? doc.data() : undefined;
    } else {
        if (userCompanyId) {
            const companyDoc = await adminDb.collection('companies').doc(userCompanyId).get();
            settingsSource = companyDoc.exists ? companyDoc.data() : undefined;
        }
        if (!settingsSource) {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
            settingsSource = userSettingsDoc.exists ? userSettingsDoc.data() : undefined;
        }
    }
    
    const globalSettingsDoc = await adminDb.collection('companies').doc('global_settings').get();
    const globalSettingsSource = globalSettingsDoc.exists ? globalSettingsDoc.data() : undefined;
    
    const loggedInUserSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    if (loggedInUserSettingsDoc.exists) {
        userConfig.aiUsageCount = loggedInUserSettingsDoc.data()?.aiUsageCount || 0;
    }
    
    if (globalSettingsSource) {
      const partnerAppData = partnerAppConnectionDataSchema.safeParse(globalSettingsSource.connections?.partner_app || {});
      userConfig.shopifyCustomAppConfigured = !!(partnerAppData.success && partnerAppData.data.clientId && partnerAppData.data.clientSecret);
      if (partnerAppData.success && partnerAppData.data.partnerApiToken && partnerAppData.data.organizationId) {
          userConfig.shopifyPartnerConfigured = true;
      }
    }

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

        if (activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword) {
            userConfig.wordPressConfigured = true; // Mark WP as configured if credentials exist
            const { wordpressApiUrl: url, wordpressUsername: username, wordpressApplicationPassword: applicationPassword } = activeConnection;
            
            try {
                if (!url) throw new Error("WordPress URL is not defined.");
                const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                const siteUrl = new URL(fullUrl).origin;
                const statusCheckEndpoint = `${siteUrl}/wp-json/custom/v1/status`;
                
                console.log(`[Plugin Check] Attempting to verify plugin via status endpoint: ${statusCheckEndpoint}`);
                
                const token = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
                const response = await axios.get(statusCheckEndpoint, {
                    headers: { 'Authorization': `Basic ${token}` },
                    timeout: 10000,
                });
                
                if (response.status === 200 && response.data?.status === 'ok' && response.data?.verified === true) {
                    console.log(`[Plugin Check] SUCCESS for ${url}. Status: ${response.status}. Plugin is active and verified.`);
                    userConfig.pluginActive = true;
                } else {
                    userConfig.pluginActive = false;
                    userConfig.pluginError = response.data?.verified === false ? 'La API Key no es válida. Por favor, verifica y guarda la clave en los ajustes del plugin.' : 'Respuesta inesperada del endpoint de estado del plugin. Asegúrate de que el plugin esté actualizado.';
                    console.warn(`[Plugin Check] UNEXPECTED RESPONSE for ${url}. Status: ${response.status}. Body:`, response.data);
                }
            } catch (pluginError: any) {
                userConfig.pluginActive = false;
                let errorMessageForLog = `[Plugin Check] FAILED for ${url}.`;
                
                if (pluginError.response && pluginError.response.status === 404) {
                    userConfig.pluginError = 'No se encontró el endpoint /custom/v1/status. Asegúrate de que el plugin "AutoPress AI Helper" está instalado y activo en tu WordPress.';
                    errorMessageForLog += ` Status: 404. Reason: ${userConfig.pluginError}`;
                } else if (pluginError.response && (pluginError.response.status === 401 || pluginError.response.status === 403)) {
                    userConfig.pluginError = 'Las credenciales de WordPress API son incorrectas o no tienen suficientes permisos.';
                    errorMessageForLog += ` Status: ${pluginError.response.status}. Reason: ${userConfig.pluginError}`;
                } else {
                    userConfig.pluginError = 'No se pudo conectar con la API de WordPress. Revisa la URL y la conectividad.';
                    errorMessageForLog += ` Reason: ${userConfig.pluginError} - ${pluginError.message}`;
                }
                console.error(errorMessageForLog);
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
