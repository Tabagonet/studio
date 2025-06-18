
// src/lib/firebase.ts
import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore';

// These variables are expected to be in your .env.local file or environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;
let db: Firestore;
let storage: FirebaseStorage;

try {
  app = getApp('wooautomate'); // Use a unique app name if you have multiple Firebase apps
} catch (e) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Firebase client config is missing. Make sure NEXT_PUBLIC_FIREBASE_ environment variables are set.");
    // Depending on desired behavior, you might throw an error or use fallback values.
    // For now, we let initializeApp handle potential errors if config is truly missing.
  }
  app = initializeApp(firebaseConfig, 'wooautomate');
}

db = getFirestore(app);
storage = getStorage(app);

export { app, db, storage };
