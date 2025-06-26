
'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance and exports it for use in other parts of the application.
 * It's configured to use Google AI and automatically adds production-ready plugins for tracing and authentication
 * when deployed on Firebase or Vercel.
 */
import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { googleCloud } from '@genkit-ai/google-cloud';

const plugins = [googleAI()];

// Add production plugins only when deploying.
// VERCEL_ENV is a Vercel-specific environment variable.
// FIREBASE_APP_HOSTING_SITE_ID is a Firebase App Hosting-specific environment variable.
if (process.env.VERCEL_ENV || process.env.FIREBASE_APP_HOSTING_SITE_ID) {
  plugins.push(firebase()); // Enables flow tracing and inspection in Firebase console
  plugins.push(googleCloud()); // Enables GCP-based authentication
}

export const ai = genkit({
  plugins,
  enableTracingAndMetrics: true, // Recommended for production observability
});
