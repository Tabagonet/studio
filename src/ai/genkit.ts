'use server';
/**
 * @fileoverview This file initializes a singleton Genkit 'ai' object with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server.
 */

import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { initializeApp, getApps } from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure and export the Genkit AI object.
// This instance will be imported by all flows.
export const ai = genkit({
  plugins: [googleAI()],
});
