
'use server';

/**
 * @fileOverview Centralized Genkit initialization.
 * This file configures and exports a single `ai` instance to be used across the application.
 * This ensures consistency and prevents module resolution issues.
 */

import { genkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [
    googleAI({
      // The API key is passed automatically from the GOOGLE_API_KEY environment variable.
    }),
  ],
});
