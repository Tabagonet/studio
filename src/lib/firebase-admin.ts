
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!admin.apps.length) {
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set. Firebase Admin SDK cannot be initialized.");
    // Throw an error or handle this case appropriately for your application
    // For now, functions relying on admin SDK will fail if this is not set.
  } else {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        // storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET // Optional: if you need admin storage access directly
      });
       console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_JSON or initializing Firebase Admin SDK:", error);
    }
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
const adminStorage = admin.storage(); // If you need admin storage access

export { adminDb, adminAuth, adminStorage, admin };
