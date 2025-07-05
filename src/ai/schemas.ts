
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

// === Schemas for Link Suggestion Flow ===

export const SuggestLinksInputSchema = z.object({
  currentContent: z.string().describe("The full HTML content of the article or page being edited."),
  potentialTargets: z.array(z.object({
    title: z.string(),
    link: z.string(),
  })).describe("A list of all available posts and pages on the site to link to."),
});
export type SuggestLinksInput = z.infer<typeof SuggestLinksInputSchema>;

export const LinkSuggestionSchema = z.object({
    phraseToLink: z.string().describe("The exact phrase from the source content that should be turned into a link."),
    targetUrl: z.string().url().describe("The URL of the target page or post."),
    targetTitle: z.string().describe("The title of the target page or post."),
});
export type LinkSuggestion = z.infer<typeof LinkSuggestionSchema>;

export const SuggestLinksOutputSchema = z.object({
    suggestions: z.array(LinkSuggestionSchema).describe("An array of up to 5 high-quality internal link suggestions."),
});
export type SuggestLinksOutput = z.infer<typeof SuggestLinksOutputSchema>;
