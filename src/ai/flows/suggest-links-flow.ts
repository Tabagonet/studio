/**
 * @fileOverview An AI flow for suggesting internal links within content.
 *
 * - suggestInternalLinks - A function that suggests internal links.
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

  if (!result || !result.response) {
      throw new Error("AI returned an invalid or empty response.");
  }
  
  const responseText = result.response.text();
  const parsedJson = JSON.parse(responseText);

  return SuggestLinksOutputSchema.parse(parsedJson);
}
