'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 * This version uses the standard ES Module import syntax for stability.
 */
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// This is the standard, documented way to initialize the plugin.
const googleAiPlugin = googleAI();

// Configure and export the AI instance with the pre-initialized plugin.
// This explicit, two-step process is more stable for the Next.js bundler.
export const ai = genkit({
  plugins: [
    googleAiPlugin,
  ],
});
