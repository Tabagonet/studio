
'use server';

/**
 * @fileOverview Centralized Genkit initialization.
 * This file configures and exports a single `ai` instance for use across the application.
 */

import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  enableTelemetry: false,
});
