
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;

console.log("Firebase Admin SDK: Module loaded.");

// Log environment variables status
const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const projectIdEnv = process.env.FIREBASE_PROJECT_ID;
const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY; // Raw, might contain \\n
const clientEmailEnv = process.env.FIREBASE_CLIENT_EMAIL;

console.log(`Firebase Admin SDK ENV Status:
  FIREBASE_SERVICE_ACCOUNT_JSON is ${serviceAccountJsonString ? 'PRESENT (length: ' + (serviceAccountJsonString?.length || 0) + ')' : 'ABSENT'}
  FIREBASE_PROJECT_ID is ${projectIdEnv ? `PRESENT ('${projectIdEnv}')` : 'ABSENT'}
  FIREBASE_PRIVATE_KEY is ${privateKeyEnv ? 'PRESENT' : 'ABSENT'}
  FIREBASE_CLIENT_EMAIL is ${clientEmailEnv ? `PRESENT ('${clientEmailEnv}')` : 'ABSENT'}
`);

if (!admin.apps.length) {
  console.log("Firebase Admin SDK: No app initialized yet. Attempting initialization.");
  let serviceAccount: admin.ServiceAccount | undefined;

  if (serviceAccountJsonString) {
    console.log("Firebase Admin SDK: Trying to use FIREBASE_SERVICE_ACCOUNT_JSON.");
    try {
      serviceAccount = JSON.parse(serviceAccountJsonString);
      console.log("Firebase Admin SDK: Parsed FIREBASE_SERVICE_ACCOUNT_JSON successfully.");
    } catch (error) {
      console.error("Firebase Admin SDK: Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:", error);
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON (first 100 chars):", serviceAccountJsonString.substring(0, 100));
      // serviceAccount remains undefined
    }
  } else if (projectIdEnv && privateKeyEnv && clientEmailEnv) {
    console.log("Firebase Admin SDK: Trying to use individual env vars (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL).");
    const formattedPrivateKey = privateKeyEnv.replace(/\\n/g, '\n');
    serviceAccount = {
      projectId: projectIdEnv,
      privateKey: formattedPrivateKey,
      clientEmail: clientEmailEnv,
    };
    console.log("Firebase Admin SDK: Constructed serviceAccount from individual env vars.");
  } else {
    console.error("Firebase Admin SDK: Insufficient credentials provided on the server. Cannot initialize.");
  }

  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // Optionally, provide a projectId if it's not in the service account
        // projectId: serviceAccount.projectId || projectIdEnv,
      });
      console.log("Firebase Admin SDK: admin.initializeApp() called successfully.");
    } catch (error) {
      console.error("Firebase Admin SDK: ERROR during admin.initializeApp():", error);
      if (serviceAccountJsonString) {
        console.error("Used FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it's valid and complete.");
      } else {
        console.error("Used individual credential variables. Check their validity and format (e.g., private key newlines were processed).");
      }
      // Avoid logging the full private key, even redacted, if parsing JSON failed earlier
      if (serviceAccount && typeof serviceAccount === 'object') {
        console.error("Service Account Object used (privateKey redacted):", JSON.stringify(serviceAccount, (key, value) => key === 'privateKey' ? '[REDACTED]' : value));
      }
    }
  }
} else {
  console.log(`Firebase Admin SDK: App already initialized. Found ${admin.apps.length} app(s). Using existing app.`);
}

if (admin.apps.length > 0) {
  console.log("Firebase Admin SDK: Attempting to get Firestore and Auth instances.");
  try {
    adminDb = admin.firestore();
    adminAuth = admin.auth();
    if (!adminDb) {
      console.error("Firebase Admin SDK: admin.firestore() returned null/undefined even though an app exists.");
    } else {
      console.log("Firebase Admin SDK: Firestore instance obtained.");
    }
    if (!adminAuth) {
      console.error("Firebase Admin SDK: admin.auth() returned null/undefined even though an app exists.");
    } else {
      console.log("Firebase Admin SDK: Auth instance obtained.");
    }
  } catch (error) {
    console.error("Firebase Admin SDK: ERROR getting Firestore/Auth instance:", error);
    adminDb = null;
    adminAuth = null;
  }
} else {
    console.warn("Firebase Admin SDK: CRITICAL - No Firebase app initialized after all attempts. Firestore and Auth will NOT be available.");
}

export { adminDb, adminAuth, admin };
