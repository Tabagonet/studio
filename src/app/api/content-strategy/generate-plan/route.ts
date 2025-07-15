
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { GoogleGenerativeAI } from "@google/generative-ai";

const generatePlanSchema = z.object({
  businessContext: z.string().min(20, "El contexto debe tener al menos 20 caracteres."),
  url: z.string().url("Por favor, introduce una URL válida.").optional(),
});

const outputSchema = z.object({
  pillarContent: z.object({
    title: z.string(),
    description: z.string(),
  }),
  keywordClusters: z.array(z.object({
    topic: z.string(),
    intent: z.enum(['Informativa', 'Comercial', 'Transaccional', 'Navegacional']),
    articles: z.array(z.object({
      title: z.string(),
      keywords: z.array(z.string()),
    })),
  })),
});
export type StrategyPlan = z.infer<typeof outputSchema>;


export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin is not initialized.");
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = generatePlanSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
    }

    const { businessContext, url } = validation.data;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    
    const prompt = `
        Eres un estratega de contenidos SEO de clase mundial. Tu tarea es analizar la descripción de un negocio y crear una estrategia de contenidos basada en el modelo de "Topic Clusters" (grupos de temas).
        ${url ? `Toma en cuenta que la estrategia es para el sitio web: ${url}.` : ''}

        **Contexto del Negocio:**
        ---
        ${businessContext}
        ---

        **Instrucciones:**
        Genera una respuesta JSON válida con la siguiente estructura y contenido:

        1.  **"pillarContent" (Objeto):**
            *   "title": Un título para una pieza de contenido pilar. Este debe ser un tema amplio y completo que abarque el núcleo del negocio.
            *   "description": Una breve descripción de lo que debería cubrir este contenido pilar.

        2.  **"keywordClusters" (Array de Objetos):** Un array de 2 a 4 clusters temáticos. Cada cluster debe ser un subtema del contenido pilar. Para cada objeto del cluster:
            *   "topic": El nombre del subtema del cluster (ej. "Beneficios de las Velas de Soja").
            *   "intent": La intención de búsqueda principal para este cluster. Debe ser uno de: 'Informativa', 'Comercial', 'Transaccional', 'Navegacional'.
            *   "articles" (Array de Objetos): Un array de 2 a 3 ideas de artículos específicos dentro de ese cluster. Para cada artículo:
                *   "title": Un título de artículo de blog atractivo y específico.
                *   "keywords": Un array de 2-4 palabras clave long-tail relevantes para ese artículo.

        **Ejemplo de salida para una tienda de velas:**
        {
          "pillarContent": {
            "title": "La Guía Definitiva de las Velas Aromáticas Naturales",
            "description": "Un artículo completo que cubre todo, desde los tipos de cera hasta cómo elegir el aroma perfecto y cuidar tus velas."
          },
          "keywordClusters": [
            {
              "topic": "Velas de Soja vs. Parafina",
              "intent": "Comercial",
              "articles": [
                { "title": "¿Son las velas de soja mejores para tu salud?", "keywords": ["velas de soja beneficios", "alternativas a parafina"] },
                { "title": "Duración y Cuidado: Soja vs Parafina", "keywords": ["cuánto dura una vela de soja", "cuidar velas de cera de soja"] }
              ]
            }
          ]
        }
        
        Genera el plan de contenidos ahora.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const plan = outputSchema.parse(JSON.parse(response.text()));

    if (adminDb) {
      await adminDb.collection('user_settings').doc(uid).set({ 
        aiUsageCount: admin.firestore.FieldValue.increment(1) 
      }, { merge: true });

      // Save the generated plan to history
      const newPlanRef = adminDb.collection('content_strategy_plans').doc();
      const planToSave = {
        userId: uid,
        businessContext,
        url: url || null,
        plan,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await newPlanRef.set(planToSave);

      return NextResponse.json({ ...plan, id: newPlanRef.id, businessContext, url: url || null, createdAt: new Date().toISOString() });
    }
    
    return NextResponse.json(plan);

  } catch (error: any) {
    console.error('Error generating content plan:', error);
    return NextResponse.json({ error: 'Failed to generate content plan', details: error.message }, { status: 500 });
  }
}
