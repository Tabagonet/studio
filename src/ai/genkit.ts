'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
import * as GenkitCore from '@genkit-ai/core';
import * as googleAI from '@genkit-ai/googleai';
import * as firebase from '@genkit-ai/firebase';
import * as googleCloud from '@genkit-ai/google-cloud';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with all necessary plugins.
// We use a type cast `(plugin as any).default()` because of a known issue with Next.js's
// module resolution for these specific server-side packages.
export const ai = (GenkitCore as any).default({
  plugins: [
    (googleAI as any).default(),
    (firebase as any).default(),
    (googleCloud as any).default(),
  ],
});
