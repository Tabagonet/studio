// src/ai/genkit.ts
'use server';
/**
 * @fileOverview Centralized Genkit initialization using a singleton pattern.
 * This approach prevents re-initialization issues caused by Next.js hot-reloading in development.
 * It ensures a single instance of the Genkit AI object is used throughout the application's lifecycle.
 */

import { genkit, type Genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

// Extend the NodeJS.Global interface to include our custom 'ai' property.
declare const global: typeof globalThis & {
  ai: Genkit;
};

// This function provides a singleton instance of the Genkit AI object.
function getGenkitInstance(): Genkit {
  // If the instance doesn't exist on the global object, create it.
  if (!global.ai) {
    console.log("src/ai/genkit.ts: Initializing new Genkit instance...");
    global.ai = genkit({
      plugins: [googleAI()],
      enableTelemetry: false,
    });
  } else {
    // console.log("src/ai/genkit.ts: Reusing existing Genkit instance.");
  }
  return global.ai;
}

// Export the singleton instance for use in other parts of the application.
export const ai = getGenkitInstance();
