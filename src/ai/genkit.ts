'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 * This version uses 'require' to align with the 'serverComponentsExternalPackages'
 * configuration in next.config.js, which is often more stable in complex build environments.
 */
const { genkit } = require('@genkit-ai/core');
const googleAI = require('@genkit-ai/googleai');
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with all necessary plugins.
// The .default() is often needed when requiring ES modules from CommonJS-like environments.
export const ai = genkit({
  plugins: [
    googleAI.default(),
  ],
});
