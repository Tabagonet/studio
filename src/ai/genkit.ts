
'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance and exports it for use in other parts of the application.
 * It's configured to use Google AI and automatically adds production-ready plugins for tracing and authentication
 * when deployed on Firebase or Vercel.
 */
import * as GenkitCore from '@genkit-ai/core';
import * as GenkitGoogleAI from '@genkit-ai/googleai';
import * as GenkitFirebase from '@genkit-ai/firebase';
import * as GenkitGoogleCloud from '@genkit-ai/google-cloud';

// In production environments (like Vercel or Firebase App Hosting),
// these plugins enable tracing, authentication, and other features.
const plugins = [
    GenkitGoogleAI.googleAI(),
    GenkitFirebase.firebase(),
    GenkitGoogleCloud.googleCloud()
];

export const ai = GenkitCore.genkit({
  plugins,
  enableTracingAndMetrics: true, // Recommended for production observability
});
