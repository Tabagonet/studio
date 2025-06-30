'use server';
/**
 * @fileoverview This file initializes Genkit with plugins for use
 * throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server. It should be imported for its side effects.
 */

import {initGenkit} from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';
import {initializeApp, getApps} from 'firebase-admin/app';

// Initialize Firebase Admin SDK if not already initialized
if (getApps().length === 0) {
  initializeApp();
}

// Configure Genkit with the Google AI plugin.
// This file is imported for its side effects and does not export anything.
initGenkit({
  plugins: [googleAI()],
});
