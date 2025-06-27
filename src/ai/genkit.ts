
'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
// Using `require` for the core library and `import * as` for plugins has proven
// to be the most robust way to handle module resolution issues in Next.js.
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
// The type cast `(plugin as any).default()` is a workaround for Next.js bundling behavior.
export const ai = genkit({
  plugins: [
    (googleAI as any).default(),
    (firebase as any).default(),
    (googleCloud as any).default(),
  ],
});
