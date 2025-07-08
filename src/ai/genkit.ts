
'use server';

import { genkit, configureGenkit } from 'genkit';
import { googleAI } from '@genkit/google-ai';

export const ai = genkit({
  plugins: [
    googleAI(),
  ],
});
