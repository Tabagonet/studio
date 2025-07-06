
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = 'force-dynamic';

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
  postType: z.enum(['Post', 'Page', 'Producto']).optional().default('Post'),
});

const PROMPT_DEFAULTS: Record<string, string> = {
    blogGeneration: `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. All paragraphs (<p> tags) MUST be styled with text-align: justify; for example: <p style="text-align: justify;">Your paragraph here.</p>), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.\n\nGenerate a blog post.\nTopic: "{{topic}}"\nInspiration Keywords: "{{keywords}}"\nLanguage: {{language}}`,
    blogEnhancement: `You are an expert SEO copywriter. Your task is to analyze a blog post's title and content and rewrite them to be more engaging, clear, and SEO-optimized. Return a single, valid JSON object with two keys: 'title' and 'content'. The content should preserve the original HTML tags. Do not include markdown or the word 'json' in your output.\n\nRewrite and improve the title and content in {{language}} for this blog post.\nOriginal Title: "{{existingTitle}}"\nOriginal Content:\n---\n{{{existingContent}}}\n---`,
    titleSuggestion: `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.\n\nGenerate 5 blog post titles in {{language}} for the keyword: "{{ideaKeyword}}`,
    keywordSuggestion: `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (a comma-separated string of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.\n\nGenerate SEO keywords for this blog post in {{language}}.\nTitle: "{{existingTitle}}"\nContent:\n---\n{{{existingContent}}}\n---`,
    
    // New product-specific prompts
    productSeoTitleEnhancement: `You are an expert e-commerce copywriter. Rewrite the following product title to be more compelling and SEO-friendly for an online store. The new title must be in {{language}}. Keep it under 60 characters. It should be clear, include the focus keyword "{{keywords}}", and highlight a key benefit if possible.\n\nReturn a JSON object with one key: {"title": "new improved title"}.\n\nOriginal Product Title: "{{existingTitle}}"`,
    productSeoMetaDescGeneration: `You are an expert e-commerce copywriter. Write a compelling meta description (under 160 characters) for the following product. The description must be in {{language}}, include the focus keyword "{{keywords}}", and encourage clicks with a clear call to action or unique selling proposition.\n\nReturn a JSON object with one key: {"metaDescription": "new compelling meta description"}.\n\nProduct Title: "{{existingTitle}}"\nProduct Content (for context):\n{{{existingContent}}}`,
};


async function getPrompt(uid: string, promptKey: string): Promise<string> {
    const defaultPrompt = PROMPT_DEFAULTS[promptKey];
    if (!defaultPrompt) throw new Error(`Default prompt for key "${promptKey}" not found.`);
    if (!adminDb) return defaultPrompt;

    try {
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
        return userSettingsDoc.data()?.prompts?.[promptKey] || defaultPrompt;
    } catch (error) {
        console.error(`Error fetching '${promptKey}' prompt, using default.`, error);
        return defaultPrompt;
    }
}


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

    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validationResult = BlogContentInputSchema.safeParse(body);

        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const input = validationResult.data;
        
        const contentSnippet = (input.existingContent || '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 1500);
        const modelInput = { ...input, existingContent: contentSnippet };

        let promptKey = '';
        if (input.postType === 'Producto') {
            switch (input.mode) {
                case 'enhance_title': promptKey = 'productSeoTitleEnhancement'; break;
                case 'generate_meta_description': promptKey = 'productSeoMetaDescGeneration'; break;
                // Fallback to blog prompts for other actions if needed, or handle as error
                default: promptKey = 'keywordSuggestion'; // Sensible default for other actions
            }
        } else { // Post or Page
             switch (input.mode) {
                case 'generate_from_topic': promptKey = 'blogGeneration'; break;
                case 'enhance_content': promptKey = 'blogEnhancement'; break;
                case 'suggest_titles': promptKey = 'titleSuggestion'; break;
                case 'suggest_keywords': promptKey = 'keywordSuggestion'; break;
                default: promptKey = 'blogGeneration'; // Default for other blog-related modes
            }
        }
        
        // Handle modes without a dedicated editable prompt
        if (['enhance_title', 'generate_meta_description', 'generate_image_meta', 'generate_focus_keyword'].includes(input.mode) && !promptKey) {
            let specificInstruction = '';
            if (input.mode === 'enhance_title') {
                specificInstruction = `You are an expert SEO copywriter. Rewrite a blog post title to be more engaging and SEO-optimized (under 60 characters). Respond with a JSON object: {"title": "new title"}.\n\nRewrite the title for this post in ${modelInput.language}, including the keyword "${modelInput.keywords}".\nOriginal Title: "${modelInput.existingTitle}"\nContext:\n${modelInput.existingContent}`;
            } else if (input.mode === 'generate_meta_description') {
                specificInstruction = `You are an expert SEO copywriter. Write a compelling meta description (under 160 characters) for the given blog post. Respond with a JSON object: {"metaDescription": "new meta description"}.\n\nGenerate a meta description in ${modelInput.language} for:\nTitle: "${modelInput.existingTitle}"\nContent:\n${modelInput.existingContent}`;
            } else if (input.mode === 'generate_image_meta') {
                specificInstruction = `You are an expert SEO specialist. Generate generic but descriptive SEO metadata for images based on a blog post's content. Respond with a JSON object: {"imageTitle": "title", "imageAltText": "alt text"}.\n\nGenerate generic image metadata in ${modelInput.language} for a blog post titled "${modelInput.existingTitle}".`;
            } else if (input.mode === 'generate_focus_keyword') {
                specificInstruction = `You are an expert SEO analyst. Identify the primary focus keyword (2-4 words) from a blog post title and content. Respond with a JSON object: {"focusKeyword": "keyword"}.\n\nIdentify the focus keyword in ${modelInput.language} for:\nTitle: "${modelInput.existingTitle}"\nContent:\n${modelInput.existingContent}`;
            } else {
                 throw new Error(`Invalid mode provided: ${input.mode}`);
            }
            
            const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
            const result = await model.generateContent(specificInstruction);
            const aiContent = JSON.parse(result.response.text());
            return NextResponse.json(aiContent);
        }

        const promptTemplate = await getPrompt(uid, promptKey);
        const template = Handlebars.compile(promptTemplate, { noEscape: true });
        const finalPrompt = template(modelInput);
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const aiContent = JSON.parse(response.text());

        if (!aiContent) {
          throw new Error('AI returned an empty response for blog content generation.');
        }

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

    