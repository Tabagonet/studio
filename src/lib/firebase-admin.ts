// src/lib/firebase-admin.ts
import type * as admin from 'firebase-admin';

// Use require for the runtime value to prevent Next.js bundling issues
const admin_sdk = require('firebase-admin');

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

function getServiceAccount() {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (serviceAccountJson) {
        try {
            return JSON.parse(serviceAccountJson);
        } catch (e) {
            console.error(`Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:`, (e as Error).message);
            throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is not a valid JSON.`);
        }
    }
    
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        return {
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        };
    }
    
    throw new Error(`Firebase Admin credentials are not set. Please provide FIREBASE_SERVICE_ACCOUNT_JSON or the individual environment variables.`);
}


// Function to export credentials for other Google Cloud services
export function getServiceAccountCredentials() {
    const serviceAccount = getServiceAccount();
    return {
        client_email: serviceAccount.clientEmail,
        private_key: serviceAccount.privateKey,
        project_id: serviceAccount.projectId,
    };
}


if (admin_sdk.apps.length === 0) {
  try {
    const serviceAccount = getServiceAccount();
    admin_sdk.initializeApp({
      credential: admin_sdk.credential.cert(serviceAccount),
      storageBucket: 'autopressai' // Use the correct bucket name
    });
    console.log('Firebase Admin SDK initialized successfully.');
    adminDb = admin_sdk.firestore();
    adminAuth = admin_sdk.auth();
    adminStorage = admin_sdk.storage();
  } catch (error: any) {
    console.error(`Firebase Admin SDK initialization error: ${error.message}`);
  }
} else {
    const defaultApp = admin_sdk.app();
    adminDb = defaultApp.firestore();
    adminAuth = defaultApp.auth();
    adminStorage = defaultApp.storage();
}


// Export the required value as 'admin' to maintain compatibility with other files
export { adminDb, adminAuth, adminStorage, admin_sdk as admin };
