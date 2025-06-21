'use server';

import {genkit} from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';

// Configure Genkit to use the Google AI plugin
export const ai = genkit({
  plugins: [
    googleAI({
      // Specify the API version if needed, e.g., 'v1beta'
      // apiVersion: 'v1beta',
    }),
  ],
  // Log all telemetry to the console
  logLevel: 'debug',
  // Use a file-based trace store for local development
  traceStore: 'file',
});
