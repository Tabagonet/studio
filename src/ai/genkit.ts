'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
// Use require for core and import * for plugins: this is the most stable approach in Next.js with Genkit 1.13
const { genkit } = require('@genkit-ai/core');
import * as googleAI from '@genkit-ai/googleai';
import * as firebase from '@genkit-ai/firebase';
import * as googleCloud from '@genkit-ai/google-cloud';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the AI instance with all necessary plugins.
// Cast to `any` to avoid build-time type errors in this environment.
export const ai = genkit({
  plugins: [
    (googleAI as any).default(),
    (firebase as any).default(),
    (googleCloud as any).default(),
  ],
});
