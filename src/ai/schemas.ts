
'use server';

import { z } from 'zod';

export const aiChecksSchema = z.object({
  titleContainsKeyword: z.boolean(),
  titleIsGoodLength: z.boolean(),
  metaDescriptionContainsKeyword: z.boolean(),
  metaDescriptionIsGoodLength: z.boolean(),
  keywordInFirstParagraph: z.boolean(),
  contentHasImages: z.boolean(),
  allImagesHaveAltText: z.boolean(),
  h1Exists: z.boolean(),
  canonicalUrlExists: z.boolean(),
});

export const SeoAnalysisInputSchema = z.object({
  title: z.string(),
  metaDescription: z.string(),
  h1: z.string(),
  headings: z.array(z.object({tag: z.string(), text: z.string()})),
  images: z.array(z.object({src: z.string().optional(), alt: z.string()})),
  aiAnalysis: z.object({
    score: z.number(),
    checks: aiChecksSchema,
    suggested: z.object({
      title: z.string(),
      metaDescription: z.string(),
      focusKeyword: z.string(),
    }),
  }),
});
export type SeoAnalysisInput = z.infer<typeof SeoAnalysisInputSchema>;

export const SeoInterpretationOutputSchema = z.object({
  interpretation: z
    .string()
    .describe(
      'A narrative paragraph explaining the most important SEO data points in a simple, easy-to-understand way.'
    ),
  actionPlan: z
    .array(z.string())
    .describe(
      "A bulleted list of the top 3-5 most impactful and actionable steps to improve the page's SEO."
    ),
  positives: z
    .array(z.string())
    .describe('A bulleted list of 2-4 key SEO strengths of the page.'),
  improvements: z
    .array(z.string())
    .describe(
      "A bulleted list of 2-4 key areas for SEO improvement, focusing on high-level concepts rather than repeating the action plan."
    ),
});
export type SeoInterpretationOutput = z.infer<
  typeof SeoInterpretationOutputSchema
>;
