'use server';
/**
 * @fileOverview An AI flow for suggesting internal links within content.
 *
 * - suggestInternalLinks - A function that suggests internal links.
 * - SuggestLinksInput - The input type for the suggestInternalLinks function.
 * - SuggestLinksOutput - The return type for the suggestInternalLinks function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

export const SuggestLinksInputSchema = z.object({
  currentContent: z.string().describe("The full HTML content of the article or page being edited."),
  potentialTargets: z.array(z.object({
    title: z.string(),
    link: z.string(),
  })).describe("A list of all available posts and pages on the site to link to."),
});
export type SuggestLinksInput = z.infer<typeof SuggestLinksInputSchema>;

const LinkSuggestionSchema = z.object({
    phraseToLink: z.string().describe("The exact phrase from the source content that should be turned into a link."),
    targetUrl: z.string().url().describe("The URL of the target page or post."),
    targetTitle: z.string().describe("The title of the target page or post."),
});

export const SuggestLinksOutputSchema = z.object({
    suggestions: z.array(LinkSuggestionSchema).describe("An array of up to 5 high-quality internal link suggestions."),
});
export type SuggestLinksOutput = z.infer<typeof SuggestLinksOutputSchema>;


export async function suggestInternalLinks(input: SuggestLinksInput): Promise<SuggestLinksOutput> {
  return suggestLinksFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestInternalLinksPrompt',
  input: {schema: SuggestLinksInputSchema},
  output: {schema: SuggestLinksOutputSchema},
  prompt: `You are an expert SEO specialist, skilled in creating effective internal linking strategies.
Your task is to analyze an article's content and a list of potential link targets from the same website.
Identify the most relevant and natural opportunities to add internal links.

**Instructions:**
1.  Read the "currentContent" carefully.
2.  Review the "potentialTargets" list, which contains the titles and URLs of other pages on the site.
3.  Find specific phrases or keywords in the "currentContent" that would naturally link to one of the "potentialTargets".
4.  Do NOT suggest linking a phrase that is already inside an <a> HTML tag.
5.  Prioritize relevance and user experience. The link should provide value to the reader.
6.  Return a list of up to 5 of the best link suggestions. For each suggestion, provide the exact phrase to link from the original text, and the corresponding target URL and title.

**Content to Analyze:**
---
{{{currentContent}}}
---

**Available pages to link to:**
---
{{#each potentialTargets}}
- Title: {{{this.title}}}
- URL: {{{this.link}}}
{{/each}}
---
`,
});

const suggestLinksFlow = ai.defineFlow(
  {
    name: 'suggestLinksFlow',
    inputSchema: SuggestLinksInputSchema,
    outputSchema: SuggestLinksOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
