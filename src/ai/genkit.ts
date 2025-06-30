'use server';

// Use require for CJS/ESM interop issues in Next.js server environments
const { initGenkit } = require('@genkit-ai/core');
const googleAI = require('@genkit-ai/googleai');
const { initializeApp, getApps } = require('firebase-admin/app');

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the Genkit AI object.
// This instance will be imported by all flows.
initGenkit({
  plugins: [googleAI()],
});
