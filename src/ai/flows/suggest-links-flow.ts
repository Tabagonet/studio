'use server';
/**
 * @fileOverview An AI flow for suggesting internal links within content.
 *
 * - suggestInternalLinks - A function that suggests internal links.
 * - SuggestLinksInput - The input type for the suggestInternalLinks function.
 * - SuggestLinksOutput - The return type for the suggestInternalLinks function.
 */
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';
import { adminDb } from '@/lib/firebase-admin';

// Helper to fetch the custom prompt from Firestore
async function getLinkSuggestionPrompt(uid: string): Promise<string> {
    const defaultPrompt = `You are an expert SEO specialist, skilled in creating effective internal linking strategies.
Your task is to analyze an article's content and a list of potential link targets from the same website.
Identify the most relevant and natural opportunities to add internal links.
The response must be a single, valid JSON object with one key "suggestions", containing an array of up to 5 high-quality internal link suggestions.

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
`;
    if (!adminDb) return defaultPrompt;
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        return userSettingsDoc.data()?.prompts?.linkSuggestion || defaultPrompt;
    } catch (error) {
        console.error("Error fetching 'linkSuggestion' prompt, using default.", error);
        return defaultPrompt;
    }
}


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


export async function suggestInternalLinks(input: SuggestLinksInput, uid: string): Promise<SuggestLinksOutput> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
  
  const rawPrompt = await getLinkSuggestionPrompt(uid);
  const template = Handlebars.compile(rawPrompt, { noEscape: true });
  const prompt = template(input);
  
  const result = await model.generateContent(prompt);
  const responseText = result.response.text();
  const parsedJson = JSON.parse(responseText);

  return SuggestLinksOutputSchema.parse(parsedJson);
}
