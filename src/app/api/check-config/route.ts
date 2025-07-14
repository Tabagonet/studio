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
        userRole = userDoc.data()?.role || null;
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
    shopifyCustomAppConfigured: false, // New status for the Custom OAuth App
    pluginActive: false,
    aiUsageCount: 0,
  };
  let activeStoreUrl: string | null = null;
  let activePlatform: 'woocommerce' | 'shopify' | null = null;
  let assignedPlatform: 'woocommerce' | 'shopify' | null = null;
  let settingsSource: admin.firestore.DocumentData | undefined;

  if (!adminDb) {
      console.warn("/api/check-config: Firestore is not available.");
      return NextResponse.json({ ...globalConfig, ...userConfig, activeStoreUrl: null, activePlatform: null, pluginActive: false, assignedPlatform: null });
  }

  try {
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');
    const targetCompanyId = searchParams.get('companyId');

    let entityId = uid;
    let entityType: 'user' | 'company' = 'user';

    if (userRole === 'super_admin') {
      if (targetCompanyId) {
        entityId = targetCompanyId;
        entityType = 'company';
      } else if (targetUserId) {
        entityId = targetUserId;
        entityType = 'user';
      }
    } else {
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (userData?.companyId) {
            entityId = userData.companyId;
            entityType = 'company';
        }
    }
    
    const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
    const settingsDoc = await adminDb.collection(settingsCollection).doc(entityId).get();
    settingsSource = settingsDoc.data();
    
    const loggedInUserSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    if (loggedInUserSettingsDoc.exists) {
        userConfig.aiUsageCount = loggedInUserSettingsDoc.data()?.aiUsageCount || 0;
    }
    
    if (settingsSource) {
      if (entityType === 'company') {
          assignedPlatform = settingsSource.platform || null;
      } else {
          const userDoc = await adminDb.collection('users').doc(entityId).get();
          if (userDoc.exists) assignedPlatform = userDoc.data()?.platform || null;
      }

      const allConnections = settingsSource.connections || {};
      const activeKey = settingsSource.activeConnectionKey;

      const partnerAppData = partnerAppConnectionDataSchema.safeParse(allConnections['partner_app'] || {});
      
      // Check for Custom App (OAuth) credentials
      userConfig.shopifyCustomAppConfigured = !!(partnerAppData.success && partnerAppData.data.clientId && partnerAppData.data.clientSecret);

      // Check for Partner API credentials
      if (partnerAppData.success && partnerAppData.data.partnerApiToken && partnerAppData.data.organizationId) {
          try {
              const verificationEndpoint = `https://partners.shopify.com/${partnerAppData.data.organizationId}/api/2025-07/graphql.json`;
              await axios.post(verificationEndpoint, 
                { query: "{ shopifyQlSchema { queryRoot { fields { name } } } }" },
                {
                  headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': partnerAppData.data.partnerApiToken }, 
                  timeout: 8000 
              });
              userConfig.shopifyPartnerConfigured = true;
          } catch(e) {
              const error = e as any;
              console.error("[API /check-config] Shopify Partner API verification failed. Details:", error.response?.data || error.message);
              userConfig.shopifyPartnerConfigured = false;
              userConfig.shopifyPartnerError = error.response?.data?.errors?.[0]?.message || error.message || "Error desconocido";
          }
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
          const { wordpressApiUrl: url, wordpressUsername: username, wordpressApplicationPassword: applicationPassword } = activeConnection;
          const token = Buffer.from(`${username}:${applicationPassword}`, 'utf8').toString('base64');
          const siteUrl = url.startsWith('http') ? url : `https://${url}`;
          const statusEndpoint = `${siteUrl.replace(/\/$/, '')}/wp-json/custom/v1/status`;
          
          try {
            const response = await axios.get(statusEndpoint, {
              headers: { 'Authorization': `Basic ${token}` },
              timeout: 10000,
            });
            if (response.status === 200 && response.data?.verified === true) {
              userConfig.pluginActive = true;
            }
          } catch (pluginError) {
            console.warn(`Plugin status check failed for ${url}:`, (pluginError as any).message);
            userConfig.pluginActive = false;
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
