'use server';
/**
 * @fileOverview An AI flow for suggesting internal links within content.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
    type SuggestLinksOutput, 
    SuggestLinksOutputSchema 
} from '@/ai/schemas';

export async function suggestInternalLinks(prompt: string): Promise<SuggestLinksOutput> {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

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
