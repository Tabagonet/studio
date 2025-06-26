
/**
 * @fileoverview This file configures the Genkit plugins for the development environment.
 * It is used by the Genkit development server to enable features like tracing and authentication.
 */
import { genkit, type GenkitConfig } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { firebase } from '@genkit-ai/firebase';
import { googleCloud } from '@genkit-ai/google-cloud';

// This is the configuration that will be used by the Genkit developer UI.
// It is not directly used by the Next.js application, but it's essential
// for debugging and running flows locally with the `genkit dev` command.
const devConfig: GenkitConfig = {
  plugins: [
    googleAI(),
    firebase(),
    googleCloud()
  ],
  logLevel: 'debug',
  enableTracingAndMetrics: true,
};

export default devConfig;
