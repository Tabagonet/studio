'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
import { genkit } from '@genkit-ai/core';
import googleAI from '@genkit-ai/googleai';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Pre-initialize the plugin to ensure it's resolved before being used.
// This provides a more stable configuration for the Next.js bundler.
const googleAiPlugin = googleAI();

// Configure and export the AI instance with the initialized plugin.
export const ai = genkit({
  plugins: [
    googleAiPlugin,
  ],
});
