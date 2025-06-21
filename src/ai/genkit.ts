
// src/ai/genkit.ts
'use server';
/**
 * @fileOverview Centralized Genkit initialization using a singleton pattern.
 * This approach prevents re-initialization issues caused by Next.js hot-reloading in development.
 * It ensures a single instance of the Genkit AI object is used throughout the application's lifecycle.
 */

// Use namespace import for robustness against module resolution issues.
import * as genkitCore from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

// Extend the NodeJS.Global interface to include our custom 'ai' property.
declare const global: typeof globalThis & {
  ai: genkitCore.Genkit;
};

console.log("src/ai/genkit.ts: Module loading...");

function getGenkitInstance(): genkitCore.Genkit {
  console.log("getGenkitInstance: Function called.");
  if (!global.ai) {
    console.log("getGenkitInstance: global.ai is NOT found. Initializing new Genkit instance...");
    try {
      console.log("getGenkitInstance: Checking type of genkitCore.genkit before calling...");
      console.log(`getGenkitInstance: typeof genkitCore.genkit is: ${typeof genkitCore.genkit}`);

      if (typeof genkitCore.genkit !== 'function') {
        console.error("getGenkitInstance: CRITICAL - genkitCore.genkit is NOT a function. The import is broken.");
        // Try to see what genkitCore contains
        try {
          console.error("getGenkitInstance: Contents of genkitCore:", JSON.stringify(Object.keys(genkitCore)));
        } catch (e) {
            console.error("getGenkitInstance: Could not stringify genkitCore keys.");
        }
        throw new Error("genkitCore.genkit is not a function. Cannot initialize AI.");
      }

      global.ai = genkitCore.genkit({
        plugins: [googleAI()],
        enableTelemetry: false,
      });
      console.log("getGenkitInstance: New Genkit instance CREATED and assigned to global.ai.");

    } catch (e: any) {
      console.error("getGenkitInstance: CRITICAL ERROR during genkit() call:", e);
      throw e;
    }
  } else {
    console.log("getGenkitInstance: Existing Genkit instance FOUND. Reusing it.");
  }
  
  if (!global.ai) {
     console.error("getGenkitInstance: CRITICAL - global.ai is STILL NULL after initialization attempt.");
  }
  
  return global.ai;
}

// Export the singleton instance for use in other parts of the application.
export const ai = getGenkitInstance();
console.log("src/ai/genkit.ts: Module fully loaded. 'ai' instance exported.");
