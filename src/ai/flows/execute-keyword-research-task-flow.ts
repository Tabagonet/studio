

'use server';

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { type ExecuteTaskInput, KeywordResearchResultSchema, type KeywordResearchResult } from '@/app/(app)/ad-planner/schema';
import { adminDb, admin } from '@/lib/firebase-admin';
import Handlebars from 'handlebars';

const KEYWORD_RESEARCH_PROMPT = `
Eres un especialista en SEM (Search Engine Marketing) y SEO. Tu tarea es realizar una investigación de palabras clave para un negocio específico.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto del Negocio:**
- URL del negocio: {{url}}
- Buyer Persona (Cliente Ideal): {{{buyerPersona}}}
- Propuesta de Valor: {{{valueProposition}}}

**Tarea a Realizar:**
- **Tarea Específica:** "{{taskName}}"
- **Instrucción:** Basándote en el contexto del negocio y la tarea, genera una lista de 10 a 15 palabras clave relevantes. Para cada palabra clave, determina la intención de búsqueda del usuario y sugiere un CPC (Coste por Clic) estimado en Euros.

**Formato de Salida JSON:**
Genera un objeto JSON con una clave "keywords". El valor debe ser un array de objetos, donde cada objeto representa una palabra clave y tiene las siguientes claves:
- **"keyword"**: (string) La palabra clave o frase.
- **"intent"**: (string, enum: "Informativa", "Comercial", "Transaccional", "Navegacional") La intención principal del usuario al buscar esa palabra clave.
- **"cpc_suggestion"**: (string) Una estimación del CPC en formato de texto, ej. "0.50€ - 1.20€".

Genera la investigación de palabras clave ahora.
`;

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

export async function executeKeywordResearchTask(input: ExecuteTaskInput): Promise<KeywordResearchResult> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash-latest", 
      generationConfig: { responseMimeType: "application/json" },
      safetySettings
  });

  const template = Handlebars.compile(KEYWORD_RESEARCH_PROMPT, { noEscape: true });
  const finalPrompt = template(input);
  
  const result = await model.generateContent(finalPrompt);
  const response = await result.response;
  let rawJson;
  try {
      rawJson = JSON.parse(response.text());
  } catch(e) {
      console.error("Error parsing JSON from keyword research task:", e);
      throw new Error("La IA devolvió una respuesta JSON inválida para la investigación de palabras clave.");
  }
  
  return KeywordResearchResultSchema.parse(rawJson);
}
