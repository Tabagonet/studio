
'use server';
/**
 * @fileoverview This file initializes the Genkit AI instance and exports it for use in other parts of the application.
 * Plugins are now configured in a separate `dev.ts` file to align with Genkit's development tooling.
 */
import * as GenkitCore from '@genkit-ai/core';

export const ai = GenkitCore.genkit();
