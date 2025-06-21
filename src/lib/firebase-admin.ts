
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

console.log("Firebase Admin SDK: Module loaded.");

const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const projectIdEnv = process.env.FIREBASE_PROJECT_ID;
const privateKeyEnv = process.env.FIREBASE_PRIVATE_KEY;
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
  let usingIndividualVars = false;

  if (serviceAccountJsonString) {
    console.log("Firebase Admin SDK: Trying to use FIREBASE_SERVICE_ACCOUNT_JSON.");
    try {
      serviceAccount = JSON.parse(serviceAccountJsonString);
      console.log("Firebase Admin SDK: Parsed FIREBASE_SERVICE_ACCOUNT_JSON successfully.");
    } catch (error) {
      console.error("Firebase Admin SDK: Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:", error);
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON (first 100 chars):", serviceAccountJsonString.substring(0, 100));
      serviceAccount = undefined;
    }
  }

  if (!serviceAccount && projectIdEnv && privateKeyEnv && clientEmailEnv) {
    console.log("Firebase Admin SDK: FIREBASE_SERVICE_ACCOUNT_JSON not used or failed. Trying to use individual env vars (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL).");
    usingIndividualVars = true;
    
    console.log("Firebase Admin SDK: Type of FIREBASE_PRIVATE_KEY:", typeof privateKeyEnv);
    console.log("Firebase Admin SDK: FIREBASE_PRIVATE_KEY (first 60 chars before replace):", privateKeyEnv.substring(0, 60));

    const formattedPrivateKey = privateKeyEnv.replace(/\\n/g, '\n');
    
    console.log("Firebase Admin SDK: formattedPrivateKey (first 60 chars after replace):", formattedPrivateKey.substring(0, 60));
    
    serviceAccount = {
      projectId: projectIdEnv,
      privateKey: formattedPrivateKey,
      clientEmail: clientEmailEnv,
    };
    console.log("Firebase Admin SDK: Constructed serviceAccount from individual env vars.");
    console.log("Firebase Admin SDK: Service Account Object to be used (privateKey redacted):", JSON.stringify(serviceAccount, (key, value) => key === 'privateKey' ? '[REDACTED - Check original and formatted logs above]' : value));

  } else if (!serviceAccount) {
    console.error("Firebase Admin SDK: Insufficient credentials provided on the server. Cannot construct serviceAccount. Ensure either FIREBASE_SERVICE_ACCOUNT_JSON or (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL) are correctly set.");
  }

  if (serviceAccount) {
    try {
      console.log("Firebase Admin SDK: Checking 'admin' and 'admin.credential' types before initializeApp...");
      console.log(`Firebase Admin SDK: typeof admin: ${typeof admin}`);
      console.log(`Firebase Admin SDK: typeof admin.credential: ${typeof admin.credential}`);
      if (admin && admin.credential) {
          console.log(`Firebase Admin SDK: typeof admin.credential.cert: ${typeof admin.credential.cert}`);
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.log("Firebase Admin SDK: admin.initializeApp() called successfully.");
    } catch (error) {
      console.error("Firebase Admin SDK: CRITICAL ERROR during admin.initializeApp():", error);
      if (usingIndividualVars) {
        console.error("Firebase Admin SDK: Initialization failed using individual credential variables. Double-check their values and the formatting of the private key (especially newlines).");
      } else if (serviceAccountJsonString) {
        console.error("Firebase Admin SDK: Initialization failed using FIREBASE_SERVICE_ACCOUNT_JSON. Ensure it's valid and complete JSON.");
      }
      if (typeof serviceAccount === 'object') {
        console.error("Firebase Admin SDK: Service Account Object that caused error (privateKey redacted):", JSON.stringify(serviceAccount, (key, value) => key === 'privateKey' ? '[REDACTED]' : value));
      }
    }
  } else {
    console.error("Firebase Admin SDK: Service account could not be determined. Initialization skipped.");
  }
} else {
  console.log(`Firebase Admin SDK: App already initialized. Found ${admin.apps.length} app(s). Using existing app.`);
}

if (admin.apps.length > 0) {
  console.log("Firebase Admin SDK: Attempting to get Firestore and Auth instances.");
  try {
    adminDb = admin.firestore();
    adminAuth = admin.auth();
    adminStorage = admin.storage();
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
     if (!adminStorage) {
      console.error("Firebase Admin SDK: admin.storage() returned null/undefined even though an app exists.");
    } else {
      console.log("Firebase Admin SDK: Storage instance obtained.");
    }
  } catch (error) {
    console.error("Firebase Admin SDK: ERROR getting Firestore/Auth/Storage instance after app initialization:", error);
    adminDb = null;
    adminAuth = null;
    adminStorage = null;
  }
} else {
    console.warn("Firebase Admin SDK: CRITICAL - No Firebase app initialized after all attempts. Firestore, Auth and Storage will NOT be available.");
    adminDb = null;
    adminAuth = null;
    adminStorage = null;
}

export { adminDb, adminAuth, adminStorage, admin };
