
'use server';
/**
 * @fileOverview An AI flow for suggesting internal links within content.
 */
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { 
    type SuggestLinksOutput, 
    SuggestLinksOutputSchema 
} from '@/ai/schemas';

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function suggestInternalLinks(prompt: string): Promise<SuggestLinksOutput> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash-latest", 
        generationConfig: { responseMimeType: "application/json" },
        safetySettings
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let rawJson;
    try {
        rawJson = JSON.parse(response.text());
    } catch(e) {
        throw new Error("La IA devolvió una respuesta JSON inválida.");
    }
    
    return SuggestLinksOutputSchema.parse(rawJson);
}
