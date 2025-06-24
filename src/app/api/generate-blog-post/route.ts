
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const GenerateBlogPostInputSchema = z.object({
  mode: z.enum(['generate_from_topic', 'enhance_content', 'suggest_keywords', 'generate_meta_description', 'suggest_titles', 'generate_image_meta', 'generate_focus_keyword']),
  language: z.string().optional().default('Spanish'),
  topic: z.string().optional(),
  keywords: z.string().optional(),
  ideaKeyword: z.string().optional(),
  existingTitle: z.string().optional(),
  existingContent: z.string().optional(),
});


export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 });
        }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token);

    } catch (error) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    try {
        const apiKey = process.env.GOOGLE_API_KEY;
        if (!apiKey) {
            throw new Error('Google AI API key is not configured on the server.');
        }

        const body = await req.json();
        const validationResult = GenerateBlogPostInputSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        const { mode, language, topic, keywords, ideaKeyword, existingTitle, existingContent } = validationResult.data;

        const genAI = new GoogleGenerativeAI(apiKey);
        
        let systemInstruction = '';
        let prompt = '';
        let model;

        if (mode === 'generate_from_topic') {
            systemInstruction = `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.`;
            prompt = `
                Generate a blog post.
                Topic: "${topic}"
                Inspiration Keywords: "${keywords || 'none'}"
                Language: ${language}
            `;
        } else if (mode === 'enhance_content') {
             systemInstruction = `You are an expert SEO copywriter. Enhance the following blog post for better readability, engagement, and search engine optimization. Correct any grammatical errors. Return a valid JSON object with two keys: 'title' (an improved, SEO-friendly title) and 'content' (the enhanced content with HTML formatting). Do not include markdown or the word 'json' in your output.`;
             prompt = `
                Enhance this blog post in ${language}.
                Original Title: "${existingTitle}"
                Original Content:
                ---
                ${existingContent}
                ---
            `;
        } else if (mode === 'generate_meta_description') {
            systemInstruction = `You are a professional SEO copywriter. Your task is to write a compelling meta description (maximum 160 characters) for the given blog post. The description should be engaging, encourage clicks, and ideally contain the main keywords from the title and content. Return a single, valid JSON object with one key: 'metaDescription'. Do not include markdown or the word 'json' in your output.`;
            prompt = `
                Generate a meta description in ${language}.
                Title: "${existingTitle}"
                Content:
                ---
                ${existingContent}
                ---
            `;
        } else if (mode === 'generate_image_meta') {
            systemInstruction = `You are an expert SEO specialist. Your task is to generate generic but descriptive SEO metadata for images that could appear in a blog post, based on its title and content. The response must be a single, valid JSON object with two keys: 'imageTitle' and 'imageAltText'. Do not include markdown or the word 'json' in your output.`;
            prompt = `
                Generate generic image metadata in ${language} for a blog post with the following details:
                Title: "${existingTitle}"
                Content Summary:
                ---
                ${existingContent?.substring(0, 500)}...
                ---
            `;
        } else if (mode === 'suggest_titles') {
             systemInstruction = `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.`;
             prompt = `
                Generate 5 blog post titles in ${language} for the keyword: "${ideaKeyword}"
            `;
        } else if (mode === 'generate_focus_keyword') {
            systemInstruction = `You are an expert SEO analyst. Your task is to identify the primary focus keyword (a short phrase of 2-4 words) from a blog post title and content. Return a single, valid JSON object with one key: 'focusKeyword'. The keyword should be in the same language as the content. Do not include markdown or the word 'json' in your output.`;
            prompt = `
                Identify the focus keyword in ${language} for this blog post:
                Title: "${existingTitle}"
                Content:
                ---
                ${existingContent}
                ---
            `;
        } else { // suggest_keywords
             systemInstruction = `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (a comma-separated string of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.`;
             prompt = `
                Generate SEO keywords for this blog post in ${language}.
                Title: "${existingTitle}"
                Content:
                ---
                ${existingContent}
                ---
            `;
        }

        model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash-latest",
            systemInstruction,
             generationConfig: {
                responseMimeType: "application/json",
            },
        });

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsedJson = JSON.parse(responseText);
        
        if (mode === 'generate_from_topic' && (!parsedJson.title || !parsedJson.content)) {
             throw new Error("AI returned an invalid JSON structure for topic generation.");
        }
        if (mode === 'enhance_content' && (!parsedJson.title || !parsedJson.content)) {
            throw new Error("AI returned an invalid JSON structure for content enhancement.");
        }
        if (mode === 'suggest_keywords' && !parsedJson.suggestedKeywords) {
            throw new Error("AI returned an invalid JSON structure for keyword suggestion.");
        }
        if (mode === 'generate_meta_description' && !parsedJson.metaDescription) {
            throw new Error("AI returned an invalid JSON structure for meta description generation.");
        }
        if (mode === 'generate_image_meta' && (!parsedJson.imageTitle || !parsedJson.imageAltText)) {
            throw new Error("AI returned an invalid JSON structure for image metadata generation.");
        }
        if (mode === 'suggest_titles' && !Array.isArray(parsedJson.titles)) {
            throw new Error("AI returned an invalid JSON structure for title suggestion.");
        }
        if (mode === 'generate_focus_keyword' && !parsedJson.focusKeyword) {
            throw new Error("AI returned an invalid JSON structure for focus keyword generation.");
        }
        
        return NextResponse.json(parsedJson);

    } catch (error: any) {
        console.error('Error generating blog post with AI:', error);
        return NextResponse.json({ error: 'Failed to generate blog post', message: error.message }, { status: 500 });
    }
}
