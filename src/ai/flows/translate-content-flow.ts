'use server';
/**
 * @fileOverview Defines the Zod schemas for the translation flow.
 * The actual translation logic is implemented in a helper function to avoid Next.js build issues.
 *
 * - TranslateContentInputSchema - The Zod schema for the input.
 * - TranslateContentOutputSchema - The Zod schema for the output.
 */

import { z } from 'zod';

export const TranslateContentInputSchema = z.object({
  contentToTranslate: z.record(z.string()),
  targetLanguage: z.string(),
});
export type TranslateContentInput = z.infer<typeof TranslateContentInputSchema>;

export const TranslateContentOutputSchema = z.record(z.string());
export type TranslateContentOutput = z.infer<typeof TranslateContentOutputSchema>;
