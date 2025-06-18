
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;

if (!admin.apps.length) {
  const serviceAccountJsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

  let serviceAccount: admin.ServiceAccount | undefined;

  if (serviceAccountJsonString) {
    try {
      serviceAccount = JSON.parse(serviceAccountJsonString);
      console.log("Firebase Admin SDK: Attempting initialization with FIREBASE_SERVICE_ACCOUNT_JSON.");
    } catch (error) {
      console.error("Firebase Admin SDK: Error parsing FIREBASE_SERVICE_ACCOUNT_JSON:", error);
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON (first 100 chars):", serviceAccountJsonString.substring(0, 100));
    }
  } else if (projectId && privateKey && clientEmail) {
    serviceAccount = {
      projectId: projectId,
      privateKey: privateKey.replace(/\\n/g, '\n'), // Ensure actual newlines
      clientEmail: clientEmail,
    };
    console.log("Firebase Admin SDK: Attempting initialization with individual FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL variables.");
  } else {
    console.error("Firebase Admin SDK: Insufficient credentials provided. Set either FIREBASE_SERVICE_ACCOUNT_JSON or (FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL).");
  }

  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("Firebase Admin SDK: Error initializing app with service account:", error);
      if (serviceAccountJsonString) {
        console.error("Used FIREBASE_SERVICE_ACCOUNT_JSON (first 100 chars):", serviceAccountJsonString.substring(0, 100));
      } else {
        console.error("Used individual credential variables.");
      }
    }
  }
}

// Assign Firestore and Auth instances after potential initialization
if (admin.apps.length > 0) {
  try {
    adminDb = admin.firestore();
    adminAuth = admin.auth();
  } catch (error) {
    console.error("Firebase Admin SDK: Failed to get Firestore or Auth instance. SDK might not be fully initialized or app access failed.", error);
    adminDb = null;
    adminAuth = null;
  }
} else {
    console.warn("Firebase Admin SDK: No Firebase app initialized. Firestore and Auth will not be available on the server.");
}


export { adminDb, adminAuth, admin };
