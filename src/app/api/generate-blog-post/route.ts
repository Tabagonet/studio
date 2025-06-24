
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

const GenerateBlogPostInputSchema = z.object({
  mode: z.enum(['generate_from_topic', 'enhance_content', 'suggest_keywords']),
  language: z.string().optional().default('Spanish'),
  topic: z.string().optional(),
  keywords: z.string().optional(),
  existingTitle: z.string().optional(),
  existingContent: z.string().optional(),
  focusKeyword: z.string().optional(),
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
        const { mode, language, topic, keywords, existingTitle, existingContent, focusKeyword } = validationResult.data;

        const genAI = new GoogleGenerativeAI(apiKey);
        
        let systemInstruction = '';
        let prompt = '';
        let model;

        if (mode === 'generate_from_topic') {
            systemInstruction = `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. If a specific 'Focus Keyword' is provided, the entire article (title, content) must be optimized around it. If no 'Focus Keyword' is provided, you must first determine the best possible primary SEO keyword for the given topic, and then write the article optimized for that keyword.
The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'focusKeyword' (the primary SEO keyword you either used or determined). Do not include markdown or the word 'json' in your output.`;
            prompt = `
                Generate a blog post.
                Topic: "${topic}"
                ${focusKeyword ? `User-provided Focus Keyword (prioritize this): "${focusKeyword}"` : ''}
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

        // Validate the response based on the mode
        if (mode === 'generate_from_topic' && (!parsedJson.title || !parsedJson.content || !parsedJson.focusKeyword)) {
             throw new Error("AI returned an invalid JSON structure for topic generation.");
        }
        if (mode === 'enhance_content' && (!parsedJson.title || !parsedJson.content)) {
            throw new Error("AI returned an invalid JSON structure for content enhancement.");
        }
        if (mode === 'suggest_keywords' && !parsedJson.suggestedKeywords) {
            throw new Error("AI returned an invalid JSON structure for keyword suggestion.");
        }
        
        return NextResponse.json(parsedJson);

    } catch (error: any) {
        console.error('Error generating blog post with AI:', error);
        return NextResponse.json({ error: 'Failed to generate blog post', message: error.message }, { status: 500 });
    }
}
