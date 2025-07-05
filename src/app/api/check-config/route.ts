
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // --- 1. Get User ID from Token ---
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error) {
    console.error("Auth error in /api/check-config:", error);
    return NextResponse.json({ error: 'Invalid or expired auth token.' }, { status: 401 });
  }

  // --- 2. Check Global Server Config (from .env) ---
  const globalConfig = {
    googleAiApiKey: !!process.env.GOOGLE_API_KEY,
    firebaseAdminSdk: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || (!!process.env.FIREBASE_PROJECT_ID && !!process.env.FIREBASE_PRIVATE_KEY && !!process.env.FIREBASE_CLIENT_EMAIL),
  };

  // --- 3. Check User/Company-Specific Config ---
  let userConfig = {
    wooCommerceConfigured: false,
    wordPressConfigured: false,
    aiUsageCount: 0,
  };
  let activeStoreUrl: string | null = null;
  let settingsSource: admin.firestore.DocumentData | undefined;

  if (adminDb) {
    try {
      // Always fetch user-specific settings first for things like AI usage
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      if (userSettingsDoc.exists) {
        userConfig.aiUsageCount = userSettingsDoc.data()?.aiUsageCount || 0;
      }

      // Now determine the source for connection settings
      const userDoc = await adminDb.collection('users').doc(uid).get();
      const userData = userDoc.data();

      if (userData?.companyId) {
        // User belongs to a company, get company settings for connections
        const companyDoc = await adminDb.collection('companies').doc(userData.companyId).get();
        settingsSource = companyDoc.data();
      } else {
        // User is individual or Super Admin, use personal settings for connections
        // We already fetched user_settings, so we can reuse it
        settingsSource = userSettingsDoc.data();
      }

      if (settingsSource) {
        const activeKey = settingsSource.activeConnectionKey;
        const allConnections = settingsSource.connections;
        
        if (activeKey && allConnections && allConnections[activeKey]) {
          const activeConnection = allConnections[activeKey];
          userConfig.wooCommerceConfigured = !!(activeConnection.wooCommerceStoreUrl && activeConnection.wooCommerceApiKey && activeConnection.wooCommerceApiSecret);
          userConfig.wordPressConfigured = !!(activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword);
          activeStoreUrl = activeConnection.wooCommerceStoreUrl || activeConnection.wordpressApiUrl || null;
        }
      }
    } catch (dbError) {
      console.error("Firestore error in /api/check-config:", dbError);
    }
  } else {
     console.warn("/api/check-config: Firestore is not available.");
  }
  
  // --- 4. Combine and Respond ---
  const finalConfigStatus = {
    ...globalConfig,
    ...userConfig,
    activeStoreUrl: activeStoreUrl,
  };

  return NextResponse.json(finalConfigStatus);
}
