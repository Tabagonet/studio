
// src/lib/firebase.ts
import { initializeApp, getApp, type FirebaseApp } from 'firebase/app';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as firebaseSignOut, // Renamed to avoid conflict if used locally
  onAuthStateChanged,
  type Auth,
  type User as FirebaseUser // Export User type
} from 'firebase/auth';

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
const appName = "autopress-ai-app"; // Unique name for the app instance

try {
  app = getApp(appName);
} catch (e) {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Firebase client config is missing. Make sure NEXT_PUBLIC_FIREBASE_ environment variables are set.");
  }
  app = initializeApp(firebaseConfig, appName);
}

const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);
const auth: Auth = getAuth(app); // Initialize auth with the named app

export { 
  app, 
  db, 
  storage, 
  auth, // Export the auth instance
  GoogleAuthProvider, 
  signInWithPopup, 
  firebaseSignOut, 
  onAuthStateChanged,
  type FirebaseUser
};
