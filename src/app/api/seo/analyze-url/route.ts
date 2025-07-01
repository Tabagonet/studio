
'use server';
import '@/ai/genkit'; // Ensures Firebase Admin is initialized

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SeoAnalysisRecord, SeoAnalysisInput } from '@/lib/types';


const analyzeUrlSchema = z.object({
  url: z.string().min(1, "La URL no puede estar vacía."),
  postId: z.number().optional(),
  postType: z.enum(['Post', 'Page']).optional(),
});

const aiChecksSchema = z.object({
    titleContainsKeyword: z.boolean().describe("El título SEO contiene la palabra clave principal."),
    titleIsGoodLength: z.boolean().describe("El título SEO tiene una longitud entre 30 y 65 caracteres."),
    metaDescriptionContainsKeyword: z.boolean().describe("La meta descripción contiene la palabra clave principal."),
    metaDescriptionIsGoodLength: z.boolean().describe("La meta descripción tiene una longitud entre 50 y 160 caracteres."),
    keywordInFirstParagraph: z.boolean().describe("La palabra clave principal se encuentra en el primer párrafo del contenido."),
    contentHasImages: z.boolean().describe("El contenido tiene al menos una imagen."),
    allImagesHaveAltText: z.boolean().describe("TODAS las imágenes en el contenido tienen texto alternativo (alt text)."),
    h1Exists: z.boolean().describe("La página tiene exactamente un encabezado H1."),
    canonicalUrlExists: z.boolean().describe("La página especifica una URL canónica."),
});

const AiResponseSchema = z.object({
  checks: aiChecksSchema,
  suggested: z.object({
    title: z.string().describe("Una sugerencia de título optimizado para SEO, con menos de 60 caracteres."),
    metaDescription: z.string().describe("Una sugerencia de meta descripción optimizada para SEO, con menos de 160 caracteres."),
    focusKeyword: z.string().describe("La palabra clave principal (2-4 palabras) más adecuada para este contenido."),
  }),
});

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


async function getBackendMetadata(postId: number, postType: 'Post' | 'Page', uid: string) {
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        console.warn('Could not get WordPress API client to fetch backend metadata.');
        return { title: '', metaDescription: '', focusKeyword: '' };
    }

    try {
        const endpoint = postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;
        const response = await wpApi.get(endpoint, { params: { context: 'edit', _fields: 'title,meta', '_': new Date().getTime() } });
        const rawData = response.data;
        
        if (!rawData) {
            throw new Error(`Could not fetch metadata for ${postType} ID ${postId} via API.`);
        }

        const yoastTitle = rawData.meta?._yoast_wpseo_title;
        const finalTitle = (typeof yoastTitle === 'string' && yoastTitle.trim() !== '') 
                           ? yoastTitle.trim()
                           : rawData.title?.rendered || '';

        return {
            title: finalTitle,
            metaDescription: rawData.meta?._yoast_wpseo_metadesc || '',
            focusKeyword: rawData.meta?._yoast_wpseo_focuskw || '',
        };
    } catch (apiError) {
        console.error(`Failed to fetch backend metadata for ${postType} ${postId}:`, apiError);
        return { title: '', metaDescription: '', focusKeyword: '' };
    }
}


async function getPageContentFromScraping(url: string) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Expires': '0',
            },
            timeout: 10000 
        });

        const html = response.data;
        const $ = cheerio.load(html);
        
        const yoastTitle = $('meta[property="og:title"]').attr('content');
        const pageTitle = $('title').text();
        const globalTitle = yoastTitle || pageTitle;
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
        
        const $body = $('body');
        // --- EXCLUSION LOGIC ---
        // Explicitly remove common non-content areas before analysis
        $body.find('header, footer, nav, .site-header, .site-footer').remove();
        $body.find('script, style, noscript').remove();
        
        const contentSelectors = ['main', 'article', '.entry-content', '.post-content', '.page-content', '#content', '#main'];
        
        let $content = $body.find(contentSelectors.join(', ')).first();
        if ($content.length === 0) {
            $content = $body; // Fallback to the modified body
        }
        
        const allImages = $content.find('img').map((i, el) => {
             const originalSrc = $(el).attr('data-src') || $(el).attr('src') || '';
             if (!originalSrc) return null;
             
             // Normalize URL to handle relative paths
             const absoluteSrc = new URL(originalSrc, url).href;

             return {
                 src: absoluteSrc,
                 alt: $(el).attr('data-alt') || $(el).attr('alt') || ''
             }
        }).get().filter(img => img !== null) as {src: string, alt: string}[];

        const uniqueImagesMap = new Map<string, { src: string; alt: string }>();
        allImages.forEach(img => {
            // Normalize URL by removing size suffixes to identify unique images
            const baseSrc = img.src.replace(/-\d+x\d+(?=\.(jpg|jpeg|png|webp|gif|svg)$)/i, '');
            const existing = uniqueImagesMap.get(baseSrc);
            // Add if new, or if existing one had no alt text but this one does
            if (!existing || (!existing.alt && img.alt)) {
                uniqueImagesMap.set(baseSrc, img);
            }
        });

        const uniqueImages = Array.from(uniqueImagesMap.values());
        
        return {
            title: globalTitle,
            metaDescription: metaDescription,
            focusKeyword: '', // Cannot get this from scraping
            canonicalUrl: canonicalUrl,
            h1: $content.find('h1').first().text() || $('h1').first().text(),
            headings: $content.find('h1, h2, h3, h4, h5, h6').map((i, el) => ({
                tag: (el as cheerio.TagElement).name,
                text: $(el).text()
            })).get(),
            images: uniqueImages,
            textContent: $content.text().replace(/\s\s+/g, ' ').trim(),
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            let message = 'No se pudo acceder a la URL.';
            if (error.code === 'ECONNABORTED') message = 'La solicitud a la URL tardó demasiado en responder (timeout de 10s).';
            else if (error.response) message = `La URL devolvió un error ${error.response.status}. Asegúrate de que es pública y accesible.`;
            console.error(`Axios error fetching URL ${url}: ${message}`, error);
            throw new Error(message);
        }
        console.error(`Failed to fetch or parse URL: ${url}`, error);
        throw new Error('No se pudo analizar la URL. Podría ser un problema de formato o de acceso.');
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
    let finalUrl = url.trim().startsWith('http') ? url : `https://${url}`;
    
    // Add cache-busting query parameter
    const urlWithCacheBust = new URL(finalUrl);
    urlWithCacheBust.searchParams.set('timestamp', Date.now().toString());
    finalUrl = urlWithCacheBust.toString();
    
    let pageData = await getPageContentFromScraping(finalUrl);

    if (postId && postType) {
        const backendMeta = await getBackendMetadata(postId, postType, uid);
        pageData = {
            ...pageData,
            title: backendMeta.title || pageData.title,
            metaDescription: backendMeta.metaDescription || pageData.metaDescription,
            focusKeyword: backendMeta.focusKeyword,
        };
    }
    
    if (!pageData.textContent || pageData.textContent.trim().length < 50) {
        throw new Error('No se encontró suficiente contenido textual en la página para analizar. Asegúrate de que la URL es correcta y tiene contenido visible.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    
    const technicalAnalysisPrompt = `
    Analiza el siguiente contenido de una página web para optimización SEO (On-Page) y responde únicamente con un objeto JSON válido.
    
    **Datos de la Página:**
    - Título SEO: "${pageData.title}"
    - Meta Descripción: "${pageData.metaDescription}"
    - Palabra Clave Principal: "${pageData.focusKeyword}"
    - URL Canónica: "${pageData.canonicalUrl || 'No encontrada'}"
    - Total de Imágenes: ${pageData.images.length}
    - Imágenes sin 'alt': ${pageData.images.filter((i: any) => !i.alt).length}
    - Encabezado H1: "${pageData.h1}"
    - Primeros 300 caracteres del contenido: "${pageData.textContent.substring(0, 300)}"

    **Instrucciones:**
    Evalúa cada uno de los siguientes puntos y devuelve un valor booleano (true/false) para cada uno en el objeto "checks". Además, proporciona sugerencias en el objeto "suggested".

    **"checks":**
    1.  "titleContainsKeyword": ¿Contiene el "Título SEO" la "Palabra Clave Principal"?
    2.  "titleIsGoodLength": ¿Tiene el "Título SEO" entre 30 y 65 caracteres?
    3.  "metaDescriptionContainsKeyword": ¿Contiene la "Meta Descripción" la "Palabra Clave Principal"?
    4.  "metaDescriptionIsGoodLength": ¿Tiene la "Meta Descripción" entre 50 y 160 caracteres?
    5.  "keywordInFirstParagraph": ¿Contienen los "Primeros 300 caracteres del contenido" la "Palabra Clave Principal"?
    6.  "contentHasImages": ¿Es el "Total de Imágenes" mayor que 0?
    7.  "allImagesHaveAltText": ¿Es el número de "Imágenes sin 'alt'" igual a 0?
    8.  "h1Exists": ¿Existe el "Encabezado H1" y no está vacío?
    9.  "canonicalUrlExists": ¿Existe la "URL Canónica" y no está vacía?

    **"suggested":**
    - "title": Sugiere un "Título SEO" mejorado.
    - "metaDescription": Sugiere una "Meta Descripción" mejorada.
    - "focusKeyword": Sugiere la "Palabra Clave Principal" más apropiada para el contenido.
  `;
  
    const techResult = await model.generateContent(technicalAnalysisPrompt);
    const techResponse = await techResult.response;
    const aiAnalysis = AiResponseSchema.parse(JSON.parse(techResponse.text()));

    if (!aiAnalysis) {
      throw new Error("La IA devolvió una respuesta vacía para el análisis técnico.");
    }

    const checkWeights = { titleContainsKeyword: 15, titleIsGoodLength: 10, metaDescriptionContainsKeyword: 15, metaDescriptionIsGoodLength: 10, keywordInFirstParagraph: 15, contentHasImages: 5, allImagesHaveAltText: 10, h1Exists: 10, canonicalUrlExists: 10 };
    let score = 0;
    Object.entries(aiAnalysis.checks).forEach(([key, passed]) => {
      if (passed) score += checkWeights[key as keyof typeof checkWeights];
    });

    const fullAnalysis = { ...pageData, aiAnalysis: { ...aiAnalysis, score } };
    
    const checksSummary = JSON.stringify(fullAnalysis.aiAnalysis.checks, null, 2);
    const interpretationPrompt = `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
    The user has received the following raw data from an analysis tool.
    Your task is to interpret this data and provide a clear, actionable summary in Spanish.

    **Analysis Data:**
    - Page Title: "${fullAnalysis.title}"
    - Meta Description: "${fullAnalysis.metaDescription}"
    - H1 Heading: "${fullAnalysis.h1}"
    - SEO Score: ${fullAnalysis.aiAnalysis.score}/100
    - Technical SEO Checks (true = passed, false = failed):
    ${checksSummary}

    **Your Task:**
    Based on all the data above, generate a JSON object with four keys: "interpretation", "actionPlan", "positives", "improvements".
    - "interpretation": Write a narrative paragraph in Spanish that interprets the key findings. Explain WHY the score is what it is, focusing on the most critical elements based on the failed checks.
    - "actionPlan": Create a list of the 3 to 5 most important, high-impact, actionable steps the user should take.
    - "positives": Create a list of 2-4 key SEO strengths of the page.
    - "improvements": Create a list of 2-4 key areas for SEO improvement, focusing on high-level concepts.
    `;
    
    const interpretationResult = await model.generateContent(interpretationPrompt);
    const interpretationResponse = await interpretationResult.response;
    const interpretation = SeoInterpretationOutputSchema.parse(JSON.parse(interpretationResponse.text()));
    
    let responsePayload: SeoAnalysisRecord;
    
    if (adminDb && admin.firestore.FieldValue) {
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(2) }, { merge: true });

        const docRef = await adminDb.collection('seo_analyses').add({
            userId: uid,
            url: url,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            analysis: fullAnalysis,
            score: score,
            interpretation: interpretation,
        });
        responsePayload = {
            id: docRef.id,
            userId: uid,
            url: url,
            createdAt: new Date().toISOString(),
            analysis: fullAnalysis,
            score: score,
            interpretation: interpretation,
        };
    } else {
        throw new Error("Firestore is not configured. Cannot save analysis.");
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error('🔥 Error in /api/seo/analyze-url:', error);
    return NextResponse.json({ error: 'La IA falló: ' + error.message }, { status: 500 });
  }
}
