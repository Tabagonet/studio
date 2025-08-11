

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

async function getEntityRef(uid: string): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const cost = 1; // Cost for suggesting links

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
}


// Helper to fetch all content titles and links
async function fetchAllContent(wpApi: AxiosInstance | null) {
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
        const { wpApi, prompts } = await getApiClientsForUser(uid);
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

        const rawPrompt = prompts.linkSuggestion;
        const template = Handlebars.compile(rawPrompt, { noEscape: true });
        const finalPrompt = template(flowInput);

        const result = await suggestInternalLinks(finalPrompt);

        const [entityRef, cost] = await getEntityRef(uid);
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });
        
        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error in suggest-internal-links API:', error);
        if (error.message && error.message.includes('503')) {
           return NextResponse.json({ error: 'El servicio de IA está sobrecargado en este momento. Por favor, inténtalo de nuevo más tarde.' }, { status: 503 });
        }
        return NextResponse.json({ error: 'Failed to suggest internal links', message: error.message }, { status: 500 });
    }
}
