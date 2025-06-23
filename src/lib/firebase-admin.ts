
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

// The service account is expected to be in a single environment variable
const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (serviceAccountJson) {
  // Check if the app is already initialized to avoid errors
  if (!admin.apps.length) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
      console.log('Firebase Admin SDK initialized successfully.');
      // Get the services after initialization
      adminDb = admin.firestore();
      adminAuth = admin.auth();
      adminStorage = admin.storage();
    } catch (error) {
      console.error('Firebase Admin SDK initialization error:', error);
      console.error("Please ensure the FIREBASE_SERVICE_ACCOUNT_JSON environment variable is a valid JSON object.");
    }
  } else {
    // If the app is already initialized, just get the services
    adminDb = admin.firestore();
    adminAuth = admin.auth();
    adminStorage = admin.storage();
  }
} else {
  // Warn if the service account JSON is missing
  console.warn('Firebase Admin SDK not initialized: FIREBASE_SERVICE_ACCOUNT_JSON environment variable is not set.');
}

export { adminDb, adminAuth, adminStorage, admin };
