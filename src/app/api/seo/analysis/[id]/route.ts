
'use server';
import '@/ai/genkit'; // Ensures Firebase Admin is initialized

import {NextRequest, NextResponse} from 'next/server';
import {adminAuth, adminDb} from '@/lib/firebase-admin';
import { z } from 'zod';
// Genkit and Google AI imports are now direct
import { generate } from '@genkit-ai/ai';
import { googleAI } from '@genkit-ai/googleai';
import { configureGenkit } from 'genkit';
import type { SeoAnalysisInput } from '@/ai/schemas';

const SeoInterpretationOutputSchema = z.object({
  interpretation: z
    .string()
    .describe(
      'A narrative paragraph explaining the most important SEO data points in a simple, easy-to-understand way.'
    ),
  actionPlan: z
    .array(z.string())
    .describe(
      "A bulleted list of the top 3-5 most impactful and actionable steps to improve the page's SEO."
    ),
  positives: z
    .array(z.string())
    .describe('A bulleted list of 2-4 key SEO strengths of the page.'),
  improvements: z
    .array(z.string())
    .describe(
      "A bulleted list of 2-4 key areas for SEO improvement, focusing on high-level concepts rather than repeating the action plan."
    ),
});


export async function GET(
  req: NextRequest,
  {params}: {params: {id: string}}
) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth)
      throw new Error(
        'La autenticación del administrador de Firebase no está inicializada.'
      );
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({error: error.message}, {status: 401});
  }

  if (!adminDb) {
    return NextResponse.json(
      {error: 'Firestore no configurado en el servidor'},
      {status: 503}
    );
  }

  const {id} = params;
  if (!id) {
    return NextResponse.json(
      {error: 'El ID del análisis es obligatorio.'},
      {status: 400}
    );
  }

  try {
    const docRef = adminDb.collection('seo_analyses').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({error: 'Análisis no encontrado.'}, {status: 404});
    }

    const data = docSnap.data();

    // Security check: ensure the user is requesting their own analysis.
    if (data?.userId !== uid) {
      return NextResponse.json({error: 'Acceso prohibido.'}, {status: 403});
    }

    const record = {
      id: docSnap.id,
      ...data,
      createdAt: data?.createdAt.toDate().toISOString(),
    };

    return NextResponse.json(record);
  } catch (error: any) {
    console.error(`Error fetching SEO analysis ${id}:`, error);
    return NextResponse.json(
      {
        error: 'Fallo al obtener los detalles del análisis',
        details: error.message,
      },
      {status: 500}
    );
  }
}


export async function POST(
  req: NextRequest,
  {params}: {params: {id: string}}
) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth)
      throw new Error(
        'La autenticación del administrador de Firebase no está inicializada.'
      );
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({error: error.message}, {status: 401});
  }

  if (!adminDb) {
    return NextResponse.json(
      {error: 'Firestore no configurado en el servidor'},
      {status: 503}
    );
  }

  const {id} = params;
  if (!id) {
    return NextResponse.json(
      {error: 'El ID del análisis es obligatorio.'},
      {status: 400}
    );
  }

  try {
    configureGenkit({
        plugins: [googleAI()],
        logLevel: 'debug',
        enableTracingAndMetrics: true,
    });
    
    const docRef = adminDb.collection('seo_analyses').doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return NextResponse.json({error: 'Análisis no encontrado.'}, {status: 404});
    }

    const data = docSnap.data();
    if (data?.userId !== uid) {
      return NextResponse.json({error: 'Acceso prohibido.'}, {status: 403});
    }
    
    if (!data.analysis) {
        throw new Error("Los datos del análisis en el registro están corruptos o incompletos.");
    }
    
    const input: SeoAnalysisInput = data.analysis;
    const checksSummary = JSON.stringify(input.aiAnalysis.checks, null, 2);
    const prompt = `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
    The user has received the following raw data from an analysis tool.
    Your task is to interpret this data and provide a clear, actionable summary in Spanish.

    **Analysis Data:**
    - Page Title: "${input.title}"
    - Meta Description: "${input.metaDescription}"
    - H1 Heading: "${input.h1}"
    - SEO Score: ${input.aiAnalysis.score}/100
    - Technical SEO Checks (true = passed, false = failed):
    ${checksSummary}

    **Your Task:**
    Based on all the data above, generate a JSON object with four keys:

    1.  "interpretation": Write a narrative paragraph in Spanish that interprets the key findings. Explain WHY the score is what it is, focusing on the most critical elements based on the failed checks (e.g., "La puntuación de ${input.aiAnalysis.score} es baja porque el título SEO no contiene la palabra clave y la meta descripción es demasiado corta. Sin embargo, la estructura de encabezados es correcta, lo cual es un buen punto de partida."). Synthesize the technical checks into a coherent explanation.

    2.  "actionPlan": Create a list of the 3 to 5 most important, high-impact, and actionable steps the user should take to improve the page's SEO, prioritizing the failed checks. Frame these as clear instructions. For example: "Revisar el título para que no supere los 60 caracteres y contenga la palabra clave principal." or "Añadir una meta descripción atractiva de unos 150 caracteres que incite al clic.".
    
    3.  "positives": Create a list of 2-4 key SEO strengths of the page. What is the page doing well from an SEO perspective?

    4.  "improvements": Create a list of 2-4 key areas for SEO improvement, focusing on high-level concepts rather than repeating the action plan. For example: "Falta de optimización en el título y meta descripción para SEO." or "La página carece de palabras clave adicionales relacionadas con el tema".
    `;

    const { output } = await generate({
        model: googleAI('gemini-1.5-flash-latest'),
        output: {
            format: 'json',
            schema: SeoInterpretationOutputSchema,
        },
        prompt,
    });
    
    if (!output) {
      throw new Error('AI returned an empty response.');
    }

    return NextResponse.json(output);

  } catch (error: any) {
    console.error(`🔥 Error interpreting analysis ${id}:`, error);
    return NextResponse.json(
      {
        error: 'La IA falló: ' + error.message,
      },
      {status: 500}
    );
  }
}
