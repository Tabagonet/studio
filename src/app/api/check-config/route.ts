
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type * as admin from 'firebase-admin';
import axios from 'axios';

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

  let userConfig = {
    wooCommerceConfigured: false,
    wordPressConfigured: false,
    pluginActive: false,
    aiUsageCount: 0,
  };
  let activeStoreUrl: string | null = null;
  let settingsSource: admin.firestore.DocumentData | undefined;

  if (!adminDb) {
      console.warn("/api/check-config: Firestore is not available.");
      return NextResponse.json({ ...globalConfig, ...userConfig, activeStoreUrl: null, pluginActive: false });
  }

  try {
    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');
    const targetCompanyId = searchParams.get('companyId');

    // Super Admins can check anyone.
    if (userRole === 'super_admin' && (targetUserId || targetCompanyId)) {
        if (targetCompanyId) {
            const companyDoc = await adminDb.collection('companies').doc(targetCompanyId).get();
            settingsSource = companyDoc.data();
        } else if (targetUserId) {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(targetUserId).get();
            settingsSource = userSettingsDoc.data();
        }
    } else {
        // Fallback to the logged-in user's context (company or personal)
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        if (userData?.companyId) {
            const companyDoc = await adminDb.collection('companies').doc(userData.companyId).get();
            settingsSource = companyDoc.data();
        } else {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
            settingsSource = userSettingsDoc.data();
        }
    }

    // AI usage is always for the logged-in user, regardless of who is being edited
    const loggedInUserSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
    if (loggedInUserSettingsDoc.exists) {
        userConfig.aiUsageCount = loggedInUserSettingsDoc.data()?.aiUsageCount || 0;
    }
    
    if (settingsSource) {
      const activeKey = settingsSource.activeConnectionKey;
      const allConnections = settingsSource.connections;
      
      if (activeKey && allConnections && allConnections[activeKey]) {
        const activeConnection = allConnections[activeKey];
        userConfig.wooCommerceConfigured = !!(activeConnection.wooCommerceStoreUrl && activeConnection.wooCommerceApiKey && activeConnection.wooCommerceApiSecret);
        userConfig.wordPressConfigured = !!(activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword);
        activeStoreUrl = activeConnection.wooCommerceStoreUrl || activeConnection.wordpressApiUrl || null;

        // New plugin check logic
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

            if (response.status === 200 && response.data?.status === 'ok') {
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
  };

  return NextResponse.json(finalConfigStatus);
}
