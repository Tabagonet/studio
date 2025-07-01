
'use server';

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { GoogleGenerativeAI } from "@google/generative-ai";

const BlogContentInputSchema = z.object({
  mode: z.enum([
    'generate_from_topic', 'enhance_content', 'enhance_title', 'suggest_keywords',
    'generate_meta_description', 'suggest_titles', 'generate_image_meta', 'generate_focus_keyword',
  ]),
  language: z.string().optional().default('Spanish'),
  topic: z.string().optional(),
  keywords: z.string().optional(),
  ideaKeyword: z.string().optional(),
  existingTitle: z.string().optional(),
  existingContent: z.string().optional(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 });
        }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;

    } catch (error) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validationResult = BlogContentInputSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const input = validationResult.data;
        
        let systemInstruction = '';
        let userPromptTemplate = '';

        const contentSnippet = (input.existingContent || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1500);
        const modelInput = { ...input, existingContent: contentSnippet };

        switch (input.mode) {
          case 'generate_from_topic':
            systemInstruction = `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. All paragraphs (<p> tags) MUST be styled with text-align: justify; for example: <p style="text-align: justify;">Your paragraph here.</p>), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Generate a blog post.
                    Topic: "{{topic}}"
                    Inspiration Keywords: "{{keywords}}"
                    Language: {{language}}
                `;
            break;
          case 'enhance_content':
            systemInstruction = `You are an expert SEO copywriter. Your task is to analyze a blog post's title and content and rewrite them to be more engaging, clear, and SEO-optimized. Return a single, valid JSON object with two keys: 'title' and 'content'. The content should preserve the original HTML tags. Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Rewrite and improve the title and content in {{language}} for this blog post.
                    Original Title: "{{existingTitle}}"
                    Original Content:
                    ---
                    {{{existingContent}}}
                    ---
                `;
            break;
          case 'enhance_title': {
            systemInstruction = `You are an expert SEO copywriter. Your task is to rewrite a blog post title to be more engaging, clear, and SEO-optimized. The title must be under 60 characters. Respond with a single, valid JSON object containing only one key: "title". Do not include markdown or the word 'json' in your output.`;
            let promptText = `Rewrite and improve ONLY the title for this blog post in {{language}}.`;
            if (modelInput.keywords) {
              promptText += `\\nIt is crucial that the new title includes the focus keyword: "{{keywords}}".`;
            }
            promptText += `\\nOriginal Title: "{{existingTitle}}"\\nContent for context:\\n---\n{{{existingContent}}}\\n---`;
            userPromptTemplate = promptText;
            break;
          }
          case 'generate_meta_description':
            systemInstruction = `You are an expert SEO copywriter. Your task is to write a compelling meta description for the given blog post. The meta description must be no more than 160 characters long. The description should be engaging and encourage clicks. Return a single, valid JSON object with one key: 'metaDescription'. Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Generate a meta description in {{language}}.
                    Title: "{{existingTitle}}"
                    Content:
                    ---
                    {{{existingContent}}}
                    ---
                `;
            break;
          case 'generate_image_meta':
            systemInstruction = `You are an expert SEO specialist. Your task is to generate generic but descriptive SEO metadata for images that could appear in a blog post, based on its title and content. The response must be a single, valid JSON object with two keys: 'imageTitle' and 'imageAltText'. Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Generate generic image metadata in {{language}} for a blog post with the following details:
                    Title: "{{existingTitle}}"
                    Content Summary:
                    ---
                    {{{existingContent}}}
                    ---
                `;
            break;
          case 'suggest_titles':
            systemInstruction = `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Generate 5 blog post titles in {{language}} for the keyword: "{{ideaKeyword}}"
                `;
            break;
          case 'generate_focus_keyword':
            systemInstruction = `You are an expert SEO analyst. Your task is to identify the primary focus keyword (a short phrase of 2-4 words) from a blog post title and content. Return a single, valid JSON object with one key: 'focusKeyword'. The keyword should be in the same language as the content. Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Identify the focus keyword in {{language}} for this blog post:
                    Title: "{{existingTitle}}"
                    Content:
                    ---
                    {{{existingContent}}}
                    ---
                `;
            break;
          case 'suggest_keywords':
            systemInstruction = `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (a comma-separated string of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.`;
            userPromptTemplate = `
                    Generate SEO keywords for this blog post in {{language}}.
                    Title: "{{existingTitle}}"
                    Content:
                    ---
                    {{{existingContent}}}
                    ---
                `;
            break;
        }

        if (!systemInstruction || !userPromptTemplate) {
          throw new Error(`Invalid mode provided to blog content flow: ${input.mode}`);
        }

        const template = Handlebars.compile(userPromptTemplate, { noEscape: true });
        const finalPrompt = template(modelInput);
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

        const result = await model.generateContent(`${systemInstruction}\n\n${finalPrompt}`);
        const response = await result.response;
        const aiContent = JSON.parse(response.text());

        if (!aiContent) {
          throw new Error('AI returned an empty response for blog content generation.');
        }

        // Increment AI usage count
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }


        return NextResponse.json(aiContent);

    } catch (error: any) {
        console.error('🔥 Error in /api/generate-blog-post:', error);
        return NextResponse.json({ error: 'La IA falló: ' + error.message }, { status: 500 });
    }
}
