'use server';
/**
 * @fileoverview Centralized Genkit initialization.
 * This file configures and exports a single Genkit instance for use across the application,
 * ensuring consistency and proper setup. It also handles the initialization of Firebase Admin SDK.
 */

import { genkit } from '@genkit-ai/ai';
import { googleAI } from '@genkit-ai/googleai';
import { initializeApp, getApps } from 'firebase-admin/app';

// Ensure Firebase Admin is initialized only once.
if (getApps().length === 0) {
  try {
    // This relies on GOOGLE_APPLICATION_CREDENTIALS or default credentials from .env
    initializeApp();
    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error('Firebase Admin SDK initialization error:', error);
  }
}

// Configure and export the Genkit instance
export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is automatically sourced from the GOOGLE_API_KEY environment variable.
      // No need to specify it here.
    }),
  ],
  // We disable detailed logging here to control it on a per-API-call basis if needed.
  // This provides more flexibility than a global setting.
  logLevel: 'warn',
  enableTracingAndMetrics: false,
});
