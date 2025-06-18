
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!admin.apps.length) {
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set. Firebase Admin SDK cannot be initialized.");
  } else {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
       console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_JSON or initializing Firebase Admin SDK:", error);
    }
  }
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();
// adminStorage is no longer used by process-photos if files are local
// const adminStorage = admin.storage(); 

export { adminDb, adminAuth, admin }; // Removed adminStorage from exports
