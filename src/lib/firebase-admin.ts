// src/lib/firebase-admin.ts
import type * as admin from 'firebase-admin';

// Use require for the runtime value to prevent Next.js bundling issues
const admin_sdk = require('firebase-admin');

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

// Function to get the credentials, can be called from other server modules
export function getServiceAccountCredentials(): admin.ServiceAccount | undefined {
    // The credentials can be provided as a single JSON string or as individual environment variables.
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountFromVars = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      // Replace escaped newlines in private key
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    };

    if (serviceAccountJson) {
      try {
        return JSON.parse(serviceAccountJson);
      } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e);
        return undefined;
      }
    } 
    
    if (serviceAccountFromVars.projectId && serviceAccountFromVars.privateKey && serviceAccountFromVars.clientEmail) {
      return {
        projectId: serviceAccountFromVars.projectId,
        privateKey: serviceAccountFromVars.privateKey,
        clientEmail: serviceAccountFromVars.clientEmail,
      };
    }

    return undefined;
}


// Initialize the app only if it hasn't been initialized yet
if (!admin_sdk.apps.length) {
  const serviceAccount = getServiceAccountCredentials();
  if (serviceAccount) {
    try {
      admin_sdk.initializeApp({
        credential: admin_sdk.credential.cert(serviceAccount),
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
if (admin_sdk.apps.length > 0) {
    adminDb = admin_sdk.firestore();
    adminAuth = admin_sdk.auth();
    adminStorage = admin_sdk.storage();
}

// Export the required value as 'admin' to maintain compatibility with other files
export { adminDb, adminAuth, adminStorage, admin_sdk as admin };
