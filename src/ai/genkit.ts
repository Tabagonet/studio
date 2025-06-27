'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
import * as core from '@genkit-ai/core';
import * as googleAIPlugin from '@genkit-ai/googleai';
import * as firebasePlugin from '@genkit-ai/firebase';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with all necessary plugins.
// Note: Using .default() on the core import based on user feedback for v1.13.0
export const ai = core.default({
  plugins: [
    googleAIPlugin.default(),
    firebasePlugin.default(),
  ],
});
