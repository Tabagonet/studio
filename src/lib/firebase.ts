// src/lib/firebase.ts
import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

// These variables are expected to be in your .env.local file
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: FirebaseApp;

try {
  app = getApp('wooautomate'); // Use a unique app name if you have multiple Firebase apps
} catch (e) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Firebase config is missing. Make sure NEXT_PUBLIC_FIREBASE_ environment variables are set.");
    // Fallback or throw error, depending on desired behavior if config is missing
    // For now, we'll let it proceed and potentially fail at initializeApp if truly missing
  }
  app = initializeApp(firebaseConfig, 'wooautomate');
}

const storage: FirebaseStorage = getStorage(app);

export { app, storage };
