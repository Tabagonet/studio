
'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance with plugins
 * for use throughout the application. It is marked as 'use server' to ensure
 * it only runs on the server, preventing Next.js bundling issues.
 */
import * as GenkitCore from '@genkit-ai/core';
import googleAI from '@genkit-ai/googleai';
import firebase from '@genkit-ai/firebase';
import googleCloud from '@genkit-ai/google-cloud';

// Configure and export the AI instance with all necessary plugins.
// This single instance will be used by all flows.
export const ai = GenkitCore.genkit({
  plugins: [
    googleAI(),
    firebase(),
    googleCloud()
  ],
});
