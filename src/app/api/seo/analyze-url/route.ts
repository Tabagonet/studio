

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getApiClientsForUser } from '@/lib/api-helpers';


const analyzeUrlSchema = z.object({
  url: z.string().min(1, "La URL no puede estar vacía."),
  postId: z.number().optional(),
  postType: z.enum(['Post', 'Page']).optional(),
});

const aiResponseSchema = z.object({
  score: z.union([z.number(), z.string()]).transform(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  }).describe("Una puntuación SEO estimada de 0 a 100."),
  summary: z.string().describe("Un breve resumen sobre de qué trata la página."),
  positives: z.array(z.string()).describe("Una lista de 2-3 aspectos SEO positivos encontrados."),
  improvements: z.array(z.string()).describe("Una lista de las 2-3 sugerencias de mejora más importantes y accionables."),
});


async function getPageContentFromApi(postId: number, postType: 'Post' | 'Page', uid: string) {
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API not configured.');
    }

    const endpoint = postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;
    // Add a cache-busting parameter to ensure fresh data is fetched
    const response = await wpApi.get(endpoint, { params: { context: 'edit', _: new Date().getTime() } });
    const rawData = response.data;
    
    if (!rawData || !rawData.content || !rawData.title) {
        throw new Error(`Could not fetch content for ${postType} ID ${postId} via API.`);
    }

    const contentHtml = rawData.content?.rendered || '';
    const $ = cheerio.load(contentHtml);
    $('script, style').remove();
    
    return {
        title: rawData.title?.rendered || '',
        metaDescription: rawData.meta?._yoast_wpseo_metadesc || '',
        h1: $('h1').first().text(),
        headings: $('h1, h2, h3, h4, h5, h6').map((i, el) => ({
            tag: (el as cheerio.TagElement).name,
            text: $(el).text()
        })).get(),
        images: $('img').map((i, el) => ({
            src: $(el).attr('src') || '',
            alt: $(el).attr('alt') || ''
        })).get(),
        textContent: $('body').text().replace(/\s\s+/g, ' ').trim(),
    };
}

async function getPageContentFromScraping(url: string) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 
        });

        const html = response.data;
        const $ = cheerio.load(html);
        $('script, style').remove();

        return {
            title: $('title').text(),
            metaDescription: $('meta[name="description"]').attr('content') || '',
            h1: $('h1').first().text(),
            headings: $('h1, h2, h3, h4, h5, h6').map((i, el) => ({
                tag: (el as cheerio.TagElement).name,
                text: $(el).text()
            })).get(),
            images: $('img').map((i, el) => ({
                src: $(el).attr('src'),
                alt: $(el).attr('alt') || ''
            })).get(),
            textContent: $('body').text().replace(/\s\s+/g, ' ').trim(),
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            let message = 'No se pudo acceder a la URL.';
            if (error.code === 'ECONNABORTED') {
                message = 'La solicitud a la URL tardó demasiado en responder (timeout de 10s).';
            } else if (error.response) {
                message = `La URL devolvió un error ${error.response.status}. Asegúrate de que es pública y accesible.`;
            }
            console.error(`Axios error fetching URL ${url}: ${message}`, error);
            throw new Error(message);
        }
        console.error(`Failed to fetch or parse URL: ${url}`, error);
        throw new Error('No se pudo analizar la URL. Podría ser un problema de formato o de acceso.');
    }
}

async function getAiAnalysis(content: string) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clave API de Google AI no está configurada en el servidor.');
  }

  const prompt = `
    Analiza el siguiente contenido de una página web para optimización SEO (On-Page). Proporciona una respuesta en español, exclusivamente como un único y válido objeto JSON.
    
    Esquema JSON Requerido:
    {
      "score": "Una puntuación SEO estimada de 0 a 100.",
      "summary": "Un breve resumen sobre de qué trata la página.",
      "positives": "Un array con 2-3 aspectos SEO positivos encontrados.",
      "improvements": "Un array con las 2-3 sugerencias de mejora más importantes y accionables."
    }

    Contenido a Analizar:
    ---
    ${content.substring(0, 30000)} 
    ---
  `;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig: { responseMimeType: "application/json" },
    safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ]
  });

  try {
    const result = await model.generateContent(prompt);
    if (result.response.promptFeedback?.blockReason) {
        const blockReason = result.response.promptFeedback.blockReason;
        console.error(`AI generation blocked due to: ${blockReason}`);
        let userMessage = "La IA no pudo procesar el contenido de esta página por motivos de seguridad.";
        if (blockReason === 'SAFETY') {
            userMessage += " Es posible que el contenido haya sido identificado como potencialmente dañino."
        }
        throw new Error(userMessage);
    }
    
    const responseText = result.response.text();
    const parsedJson = JSON.parse(responseText);
    const validation = aiResponseSchema.safeParse(parsedJson);

    if (!validation.success) {
      console.error("AI returned invalid schema:", validation.error);
      throw new Error("La IA devolvió una respuesta con un formato inesperado.");
    }
    return validation.data;
  } catch (error) {
    console.error("Error communicating with Google AI:", error);
    if (error instanceof Error && (error.message.includes("La IA no pudo procesar") || error.message.includes("formato inesperado"))) {
        throw error;
    }
    throw new Error("Hubo un error al procesar el contenido con la IA.");
  }
}

export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = analyzeUrlSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten().fieldErrors.url?.[0] || 'URL inválida' }, { status: 400 });
    }
    
    const { url, postId, postType } = validation.data;
    let pageData;

    // New logic branch: if we have an ID, fetch directly via API to bypass cache.
    if (postId && postType) {
        console.log(`Analyzing via WP API for ${postType} ID: ${postId}`);
        pageData = await getPageContentFromApi(postId, postType, uid);
    } else {
        // Fallback to scraping public URL (for external sites or when ID is not available)
        console.log(`Analyzing via scraping public URL: ${url}`);
        const finalUrl = url.trim().startsWith('http') ? url : `https://${url}`;
        pageData = await getPageContentFromScraping(finalUrl);
    }
    
    if (!pageData.textContent || pageData.textContent.trim().length < 50) {
        throw new Error('No se encontró suficiente contenido textual en la página para analizar. Asegúrate de que la URL es correcta y tiene contenido visible.');
    }
    const aiAnalysis = await getAiAnalysis(pageData.textContent);
    const fullAnalysis = { ...pageData, aiAnalysis };
    
    // Save to Firestore
    if (adminDb && admin.firestore.FieldValue) {
      const analysisRecord = {
        userId: uid,
        url: url,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        analysis: fullAnalysis,
        score: aiAnalysis.score,
      };
      await adminDb.collection('seo_analyses').add(analysisRecord);
    } else {
        console.warn("Firestore not available. SEO analysis will not be saved to history.");
    }

    return NextResponse.json(fullAnalysis);
  } catch (error: any) {
    console.error('Error in analyze-url endpoint:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
