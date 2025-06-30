'use server';

// Use require for CJS/ESM interop issues in Next.js server environments
const { initGenkit } = require('@genkit-ai/core');
const googleAIPlugin = require('@genkit-ai/googleai');
const { initializeApp, getApps } = require('firebase-admin/app');

// Handle potential .default on the plugin
const googleAI = googleAIPlugin.default || googleAIPlugin;


// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Initialize Genkit with the Google AI plugin.
// This file is now only imported for its side effect of initializing Genkit.
initGenkit({
  plugins: [
    googleAI(),
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
});
