'use server';

// Use require for CJS/ESM interop issues in Next.js server environments
const { genkit } = require('@genkit-ai/core');
const { googleAI: googleAIPlugin } = require('@genkit-ai/googleai');
const { initializeApp, getApps } = require('firebase-admin/app');

// Handle potential .default on the plugin
const googleAI = googleAIPlugin.default || googleAIPlugin;


// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the Genkit AI object.
// This instance will be imported by all flows.
export const ai = genkit({
  plugins: [googleAI()],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
