'use server';
/**
 * @fileoverview This file initializes Genkit globally with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 * This module is imported for its side effects.
 */
import { firebasePlugin } from '@genkit-ai/firebase';
import { googleAI } from '@genkit-ai/googleai';
import { genkit } from '@genkit-ai/core';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with all necessary plugins.
export const ai = genkit({
  plugins: [
    googleAI(),
    firebasePlugin(),
  ],
});
