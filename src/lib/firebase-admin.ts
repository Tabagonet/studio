// src/lib/firebase-admin.ts
import type * as admin from 'firebase-admin';

// Use require for the runtime value to prevent Next.js bundling issues
const admin_sdk = require('firebase-admin');

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

// Function to get the credentials, can be called from other server modules
function getServiceAccountCredentials() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (serviceAccountJson) {
      try {
        const parsedCredentials = JSON.parse(serviceAccountJson);
        if (!parsedCredentials.client_email || !parsedCredentials.private_key || !parsedCredentials.project_id) {
           throw new Error("El JSON de la cuenta de servicio es inválido o le faltan propiedades clave (project_id, private_key, client_email).");
        }
        return parsedCredentials;
      } catch (e: any) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido.");
      }
    } 
    
    const serviceAccountFromVars = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };
    
    if (serviceAccountFromVars.project_id && serviceAccountFromVars.private_key && serviceAccountFromVars.client_email) {
      return serviceAccountFromVars;
    }

    // Fallback: If no explicit credentials, Google Cloud environments might provide them automatically.
    // Return undefined to let the SDK try its default discovery.
    return undefined;
}


// Initialize the app only if it hasn't been initialized yet
if (!admin_sdk.apps.length) {
  try {
    const credential = getServiceAccountCredentials();
    admin_sdk.initializeApp({
      // Use cert() only if we have explicit credentials, otherwise let the SDK find them.
      credential: credential ? admin_sdk.credential.cert(credential) : undefined,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log('Firebase Admin SDK initialized.');
  } catch (error: any) {
    console.warn(`Firebase Admin SDK initialization error: ${error.message}`);
  }
}

// Assign the services if the app was successfully initialized
if (admin_sdk.apps.length > 0) {
    adminDb = admin_sdk.firestore();
    adminAuth = admin_sdk.auth();
    adminStorage = admin_sdk.storage();
}

// Export the required value as 'admin' to maintain compatibility with other files
export { adminDb, adminAuth, adminStorage, admin_sdk as admin, getServiceAccountCredentials };