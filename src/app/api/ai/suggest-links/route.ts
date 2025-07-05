import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { suggestInternalLinks, SuggestLinksInput, SuggestLinksOutput } from '@/ai/flows/suggest-links-flow';
import { z } from 'zod';
import { AxiosInstance } from 'axios';

export const dynamic = 'force-dynamic';

const suggestLinksBodySchema = z.object({
  content: z.string(),
});

// Helper to fetch all content titles and links
async function fetchAllContent(wpApi: AxiosInstance) {
    let allContent: { title: string; link: string }[] = [];
    let page = 1;
    const perPage = 100;
    const postTypes = ['posts', 'pages'];

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
                    allContent.push({ title: item.title.rendered, link: item.link });
                });

                const totalPages = response.headers['x-wp-totalpages'];
                if (!totalPages || page >= parseInt(totalPages, 10)) break;
                
                page++;
            } catch (err) {
                console.error(`Error fetching ${postType} page ${page}:`, err);
                break; // Stop fetching this post type on error
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

        const result = await suggestInternalLinks(flowInput);

        return NextResponse.json(result);

    } catch (error: any) {
        console.error('Error in suggest-internal-links API:', error);
        return NextResponse.json({ error: 'Failed to suggest internal links', message: error.message }, { status: 500 });
    }
}
