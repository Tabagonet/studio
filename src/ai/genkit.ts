
'use server';

import * as genkitCore from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';

// Configure Genkit to use the Google AI plugin
export const ai = genkitCore.genkit({
  plugins: [
    googleAI(),
  ],
});
