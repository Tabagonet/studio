
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

// The credentials can be provided as a single JSON string or as individual environment variables.
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const serviceAccountFromVars = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  // Replace escaped newlines in private key
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

let serviceAccount: admin.ServiceAccount | undefined;

if (serviceAccountJson) {
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e);
  }
} else if (serviceAccountFromVars.projectId && serviceAccountFromVars.privateKey && serviceAccountFromVars.clientEmail) {
  serviceAccount = {
    projectId: serviceAccountFromVars.projectId,
    privateKey: serviceAccountFromVars.privateKey,
    clientEmail: serviceAccountFromVars.clientEmail,
  };
}

// Initialize the app only if it hasn't been initialized yet
if (!admin.apps.length) {
  if (serviceAccount) {
    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
    }
  } else {
    // This warning is important for debugging in production environments
    console.warn('Firebase Admin SDK not initialized: No service account credentials found in environment variables. Check FIREBASE_SERVICE_ACCOUNT_JSON or individual FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL variables.');
  }
}

// Assign the services if the app was successfully initialized
if (admin.apps.length > 0) {
    adminDb = admin.firestore();
    adminAuth = admin.auth();
    adminStorage = admin.storage();
}

export { adminDb, adminAuth, adminStorage, admin };
