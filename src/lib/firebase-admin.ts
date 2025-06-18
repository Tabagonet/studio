
// src/lib/firebase-admin.ts
import * as admin from 'firebase-admin';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (!admin.apps.length) {
  if (!serviceAccountJson) {
    console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set. Firebase Admin SDK cannot be initialized on the server.");
  } else {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
       console.log("Firebase Admin SDK initialized successfully.");
    } catch (error) {
      console.error("Error parsing FIREBASE_SERVICE_ACCOUNT_JSON or initializing Firebase Admin SDK:", error);
      // Log the first 100 chars of the JSON to help debug, but be careful with sensitive data in logs
      console.error("FIREBASE_SERVICE_ACCOUNT_JSON (first 100 chars):", serviceAccountJson.substring(0, 100));
    }
  }
}

let adminDb: admin.firestore.Firestore;
let adminAuth: admin.auth.Auth;

try {
  adminDb = admin.firestore();
  adminAuth = admin.auth();
} catch (error) {
  console.error("Failed to get Firestore or Auth instance from Firebase Admin. SDK might not be initialized.", error);
  // @ts-ignore
  adminDb = null; // Explicitly set to null or a non-functional object if initialization fails
  // @ts-ignore
  adminAuth = null;
}

export { adminDb, adminAuth, admin };
