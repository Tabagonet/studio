
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";

const batchSeoMetaSchema = z.object({
  postId: z.number(),
  postType: z.enum(['Post', 'Page']),
});

async function getSeoMetaPrompt(uid: string): Promise<string> {
    const defaultPrompt = `You are an expert SEO copywriter. Your task is to analyze the title and content of a web page and generate optimized SEO metadata.
Respond with a single, valid JSON object with two keys: "title" and "metaDescription".

**Constraints:**
- The "title" must be under 60 characters.
- The "metaDescription" must be under 160 characters.
- Both must be in the same language as the provided content.

**Content for Analysis:**
- Language: {{language}}
- Title: "{{title}}"
- Content Snippet: "{{contentSnippet}}"

Generate the SEO metadata now.`;

    if (!adminDb) return defaultPrompt;
    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        // Use the new key 'batchSeoMeta'
        return userSettingsDoc.data()?.prompts?.batchSeoMeta || defaultPrompt;
    } catch (error) {
        console.error("Error fetching 'batchSeoMeta' prompt, using default.", error);
        return defaultPrompt;
    }
}


export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = batchSeoMetaSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }

        const { postId, postType } = validation.data;

        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }

        const endpoint = postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;
        const response = await wpApi.get(endpoint, { params: { context: 'edit' } });
        const post = response.data;

        if (!post) {
            throw new Error(`Content with ID ${postId} not found.`);
        }

        // We import cheerio dynamically ONLY when needed
        const cheerio = await import('cheerio');
        const contentHtml = post.content?.rendered || '';
        const $ = cheerio.load(contentHtml);
        const contentText = $('body').text().replace(/\s\s+/g, ' ').trim();

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

        const promptTemplate = await getSeoMetaPrompt(uid);
        const prompt = promptTemplate
            .replace('{{language}}', post.lang === 'es' ? 'Spanish' : 'English')
            .replace('{{title}}', post.title.rendered)
            .replace('{{contentSnippet}}', contentText.substring(0, 1500));
        
        const result = await model.generateContent(prompt);
        const aiResponse = await result.response;
        const aiContent = JSON.parse(aiResponse.text());

        const payload = {
            meta: {
                _yoast_wpseo_title: aiContent.title,
                _yoast_wpseo_metadesc: aiContent.metaDescription,
            }
        };

        await wpApi.post(endpoint, payload);

        // Increment AI usage count
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }

        return NextResponse.json({ success: true, message: `Metadatos SEO actualizados para "${post.title.rendered}".` });

    } catch (error: any) {
        console.error("Error in batch-actions/seo-meta API:", error.response?.data || error.message);
        return NextResponse.json({ error: "Failed to generate or save SEO meta", message: error.message }, { status: 500 });
    }
}
