
'use server';

import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

console.log('[WooAutomate AI] genkit.ts: Attempting to configure Genkit.');

// This approach uses a different initialization pattern to avoid module resolution
// issues with Next.js hot-reloading.
configureGenkit({
  plugins: [
    googleAI(),
  ],
  enableTelemetry: false,
  // Adding a simple logger to see if configuration completes.
  logLevel: 'debug'
});

console.log('[WooAutomate AI] genkit.ts: Genkit configuration call completed.');

// By importing this file for its side effects, we ensure this configuration runs
// before any flows are defined or used.
