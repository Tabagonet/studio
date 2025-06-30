
'use server';
/**
 * @fileoverview Centralized Genkit initialization file.
 * This file ensures that Genkit is configured and initialized once for the entire server.
 * It uses the 'require' syntax for robust CJS/ESM interop within the Next.js environment.
 *
 * This file should be imported for its side effects in any API route or server action
 * that needs to run a Genkit flow, e.g., `import '@/ai/genkit';`.
 */

const { initGenkit } = require('@genkit-ai/core');
const { googleAI } = require('@genkit-ai/googleai');
const { initializeApp, getApps } = require('firebase-admin/app');

// Ensure Firebase Admin is initialized only once.
if (getApps().length === 0) {
  initializeApp();
}

// Check if the googleAI plugin is a default export or a named export.
const googleAIPlugin = googleAI.default ? googleAI.default() : googleAI();

// Initialize Genkit with the Google AI plugin.
// This configuration is now global for the server instance.
initGenkit({
  plugins: [googleAIPlugin],
});

console.log('Genkit initialized successfully via genkit.ts');
