
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

// In production environments (like Vercel or Firebase App Hosting),
// these plugins enable tracing, authentication, and other features.
const plugins = [
    googleAI(),
    firebase(),
    googleCloud()
];

export const ai = genkit({
  plugins,
  enableTracingAndMetrics: true, // Recommended for production observability
});
