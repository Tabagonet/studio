
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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

  // --- 3. Check User-Specific Config (from Firestore) ---
  let userConfig = {
    wooCommerceConfigured: false,
    wordPressConfigured: false,
    aiUsageCount: 0, // Add usage count
  };
  let activeStoreUrl: string | null = null;

  if (adminDb) {
    try {
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      if (userSettingsDoc.exists) {
        const settings = userSettingsDoc.data();
        const allConnections = settings?.connections;
        const activeKey = settings?.activeConnectionKey;
        
        userConfig.aiUsageCount = settings?.aiUsageCount || 0;

        if (activeKey && allConnections && allConnections[activeKey]) {
          const activeConnection = allConnections[activeKey];
          userConfig.wooCommerceConfigured = !!(activeConnection.wooCommerceStoreUrl && activeConnection.wooCommerceApiKey && activeConnection.wooCommerceApiSecret);
          userConfig.wordPressConfigured = !!(activeConnection.wordpressApiUrl && activeConnection.wordpressUsername && activeConnection.wordpressApplicationPassword);
          activeStoreUrl = activeConnection.wooCommerceStoreUrl || activeConnection.wordpressApiUrl || null;
        }
      }
    } catch (dbError) {
      console.error("Firestore error in /api/check-config:", dbError);
      // Don't fail the request, just report as not configured
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
