
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { suggestInternalLinks } from '@/ai/flows/suggest-links-flow';
import type { SuggestLinksInput } from '@/ai/schemas';
import { z } from 'zod';
import type { AxiosInstance } from 'axios';
import Handlebars from 'handlebars';

const suggestLinksBodySchema = z.object({
  content: z.string(),
});

// Helper to fetch all content titles and links
async function fetchAllContent(wpApi: AxiosInstance) {
    let allContent: { title: string; link: string }[] = [];
    let page = 1;
    const perPage = 100;
    const postTypes = ['posts', 'pages', 'products'];

    for (const postType of postTypes) {
        page = 1; // Reset page for each post type
        while (true) {
            try {
                const response = await wpApi.get(postType, {
                    params: {
                        per_page: perPage,
                        page: page,
                        status: 'publish', // Only suggest links to published content
                        _fields: 'title,link', // Request only necessary fields
                    },
                });

                if (response.data.length === 0) break;
                
                response.data.forEach((item: any) => {
                    allContent.push({ title: item.title.rendered || item.name, link: item.link });
                });

                const totalPages = response.headers['x-wp-totalpages'];
                if (!totalPages || page >= parseInt(totalPages, 10)) break;
                
                page++;
            } catch (err) {
                // If a post type doesn't exist (e.g., 'products' in a site without Woo), just log it and continue.
                if ((err as any).response?.status !== 404) {
                    console.error(`Error fetching ${postType} page ${page}:`, err);
                }
                break; // Stop fetching this post type
            }
        }
    }
    return allContent;
}

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
        // The key must match the one defined in the prompts page
        return userSettingsDoc.data()?.prompts?.linkSuggestion || defaultPrompt;
    } catch (error) {
        console.error("Error fetching 'linkSuggestion' prompt, using default.", error);
        return defaultPrompt;
    }
}


export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = suggestLinksBodySchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { content } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }

        const potentialTargets = await fetchAllContent(wpApi);

        if (potentialTargets.length === 0) {
            return NextResponse.json({ suggestions: [] });
        }
        
        const flowInput: SuggestLinksInput = {
            currentContent: content,
            potentialTargets,
        };

        const rawPrompt = await getLinkSuggestionPrompt(uid);
        const template = Handlebars.compile(rawPrompt, { noEscape: true });
        const finalPrompt = template(flowInput);

        const result = await suggestInternalLinks(finalPrompt);

        // Increment AI usage count
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error in suggest-internal-links API:', error);
        return NextResponse.json({ error: 'Failed to suggest internal links', message: error.message }, { status: 500 });
    }
}
