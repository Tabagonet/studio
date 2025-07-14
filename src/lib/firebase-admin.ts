
// src/lib/firebase-admin.ts
import type * as admin from 'firebase-admin';

// Use require for the runtime value to prevent Next.js bundling issues
const admin_sdk = require('firebase-admin');

let adminDb: admin.firestore.Firestore | null = null;
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;

// Function to get the credentials, can be called from other server modules
function getServiceAccountCredentials(): admin.ServiceAccount {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    
    if (serviceAccountJson) {
      try {
        const parsedCredentials = JSON.parse(serviceAccountJson);
        if (!parsedCredentials.client_email || !parsedCredentials.private_key || !parsedCredentials.project_id) {
           throw new Error("El JSON de la cuenta de servicio es inválido o le faltan propiedades clave (project_id, private_key, client_email).");
        }
        // Ensure property names match what the SDK expects ('clientEmail', 'privateKey')
        return {
            clientEmail: parsedCredentials.client_email,
            privateKey: parsedCredentials.private_key,
            projectId: parsedCredentials.project_id,
        };
      } catch (e: any) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
        throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON no es un JSON válido.");
      }
    } 
    
    // Fallback to individual env vars
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    
    if (projectId && privateKey && clientEmail) {
      return { projectId, privateKey, clientEmail };
    }

    throw new Error("No se pudieron cargar las credenciales de la cuenta de servicio de Firebase. Configura FIREBASE_SERVICE_ACCOUNT_JSON o las variables individuales (PROJECT_ID, PRIVATE_KEY, CLIENT_EMAIL).");
}


// Initialize the app only if it hasn't been initialized yet
if (!admin_sdk.apps.length) {
  try {
    const serviceAccount = getServiceAccountCredentials();
    admin_sdk.initializeApp({
      credential: admin_sdk.credential.cert(serviceAccount),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error: any) {
    console.error(`Firebase Admin SDK initialization error: ${error.message}`);
    // This will prevent the app from starting if creds are bad, which is intended.
    throw error;
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
