

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import Handlebars from 'handlebars';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiClientsForUser, getPromptForConnection, getEntityRef as getEntityRefHelper } from '@/lib/api-helpers';


const languageCodeToName: Record<string, string> = {
    'es': 'Spanish', 'en': 'English', 'fr': 'French',
    'de': 'German', 'pt': 'Portuguese', 'it': 'Italian',
    'nl': 'Dutch', 'ru': 'Russian', 'ja': 'Japanese',
    'zh': 'Chinese', 'ar': 'Arabic', 'ko': 'Korean',
};

const BlogContentInputSchema = z.object({
  mode: z.enum([
    'generate_from_topic', 'enhance_content', 'enhance_title', 'suggest_keywords',
    'generate_meta_description', 'suggest_titles', 'generate_image_meta', 'generate_focus_keyword',
  ]),
  language: z.string().optional().default('es'),
  topic: z.string().optional(),
  tags: z.array(z.string()).optional(),
  ideaKeyword: z.string().optional(),
  existingTitle: z.string().optional(),
  existingContent: z.string().optional(),
});

const CREDIT_COSTS: Record<string, number> = {
    generate_from_topic: 10,
    enhance_content: 5,
    suggest_titles: 1,
    suggest_keywords: 1,
    generate_meta_description: 1,
    generate_focus_keyword: 1,
    generate_image_meta: 1,
    enhance_title: 1,
};

// This getCreditEntityRef is now specific to this route's credit logic.
async function getCreditEntityRef(uid: string, cost: number): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
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
        const cost = CREDIT_COSTS[input.mode] || 1;
        
        const { activeConnectionKey } = await getApiClientsForUser(uid);
        const [entityRef] = await getEntityRefHelper(uid);
        
        const languageName = languageCodeToName[input.language] || 'Spanish';

        const modelInput = { ...input, language: languageName, tags: (input.tags || []).join(', ') };

        let promptTemplate = '';
        
        let specificInstruction = '';
        switch (input.mode) {
            case 'generate_from_topic':
                promptTemplate = await getPromptForConnection('blogGeneration', activeConnectionKey, entityRef);
                break;
            case 'enhance_content':
                promptTemplate = await getPromptForConnection('blogEnhancement', activeConnectionKey, entityRef);
                break;
            case 'suggest_titles':
                 promptTemplate = await getPromptForConnection('titleSuggestion', activeConnectionKey, entityRef);
                 break;
            case 'suggest_keywords':
                 promptTemplate = await getPromptForConnection('keywordSuggestion', activeConnectionKey, entityRef);
                 break;
            case 'enhance_title':
                specificInstruction = `You are an expert SEO copywriter. Rewrite a blog post title to be more engaging and SEO-optimized (under 60 characters). Respond with a JSON object: {"title": "new title"}.\n\nRewrite the title for this post in ${modelInput.language}, including the keyword "${modelInput.tags}".\nOriginal Title: "${modelInput.existingTitle}"\nContext:\n${modelInput.existingContent}`;
                break;
            case 'generate_meta_description':
                specificInstruction = `You are an expert SEO copywriter. Write a compelling meta description (under 160 characters) for the given blog post. Respond with a JSON object: {"metaDescription": "new meta description"}.\n\nGenerate a meta description in ${modelInput.language} for:\nTitle: "${modelInput.existingTitle}"\nContent:\n${modelInput.existingContent}`;
                break;
            case 'generate_image_meta':
                specificInstruction = `You are an expert SEO specialist. Generate generic but descriptive SEO metadata for images based on a blog post's content. Respond with a JSON object: {"imageTitle": "title", "imageAltText": "alt text"}.\n\nGenerate generic image metadata in ${modelInput.language} for a blog post titled "${modelInput.existingTitle}".`;
                break;
            case 'generate_focus_keyword':
                 specificInstruction = `You are an expert SEO analyst. Identify the primary focus keyword (2-4 words) from a blog post title and content. Respond with a JSON object: {"focusKeyword": "keyword"}.\n\nIdentify the focus keyword in ${modelInput.language} for:\nTitle: "${modelInput.existingTitle}"\nContent:\n${modelInput.existingContent}`;
                 break;
            default:
                 throw new Error(`Invalid mode provided: ${input.mode}`);
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
        
        let finalPrompt: string;
        if(promptTemplate) {
            const template = Handlebars.compile(promptTemplate, { noEscape: true });
            finalPrompt = template(modelInput);
        } else {
            finalPrompt = specificInstruction;
        }

        const result = await model.generateContent(finalPrompt);
        const response = await result.response;
        const aiContent = JSON.parse(response.text());

        if (!aiContent) {
          throw new Error('AI returned an empty response for blog content generation.');
        }
        
        const [creditEntityRef, creditCost] = await getCreditEntityRef(uid, cost);
        await creditEntityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(creditCost) }, { merge: true });

        return NextResponse.json(aiContent);

    } catch (error: any) {
        console.error('🔥 Error in /api/generate-blog-post:', error);
        if (error.message && error.message.includes('503')) {
           return NextResponse.json({ error: 'El servicio de IA está sobrecargado en este momento. Por favor, inténtalo de nuevo más tarde.' }, { status: 503 });
        }
        return NextResponse.json({ error: 'La IA falló: ' + error.message }, { status: 500 });
    }
}
