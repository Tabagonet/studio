'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
// Using require to address Next.js build issues with Genkit's module resolution.
const genkit = require('@genkit-ai/core').default;
const googleAI = require('@genkit-ai/googleai').default;

import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with the Google AI plugin.
export const ai = genkit({
  plugins: [googleAI()],
});
