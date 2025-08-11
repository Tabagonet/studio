

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SeoAnalysisRecord } from '@/lib/types';
import type { AxiosInstance } from 'axios';
import Handlebars from 'handlebars';

const analyzeUrlSchema = z.object({
  url: z.string().min(1, "La URL no puede estar vacía."),
  postId: z.number().optional(),
  postType: z.enum(['Post', 'Page', 'Producto']).optional(),
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

async function getPageContentFromScraping(url: string, wpApi: AxiosInstance | null) {
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
        
        const globalTitle = $('meta[property="og:title"]').attr('content') || $('title').text();
        const metaDescription = $('meta[name="description"]').attr('content') || '';
        const canonicalUrl = $('link[rel="canonical"]').attr('href') || '';
        
        const $body = $('body');
        $body.find('header, footer, nav, .site-header, .site-footer, .header-main').remove();
        $body.find('script, style, noscript').remove();
        
        const $content = $body.find('main, article, .entry-content, .post-content, .page-content, #content, #main').first();
        const $analysisArea = $content.length ? $content : $body;
        
        const imagesFromHtml: { src: string; alt: string; mediaId: number | null }[] = [];
        $analysisArea.find('img').each((i, el) => {
            const srcAttr = $(el).attr('data-src') || $(el).attr('src');
            if (!srcAttr) return;

            const classList = $(el).attr('class') || '';
            const match = classList.match(/wp-image-(\d+)/);
            const mediaId = match ? parseInt(match[1], 10) : null;
            
            imagesFromHtml.push({
                src: new URL(srcAttr, url).href,
                alt: $(el).attr('alt') || '',
                mediaId: mediaId,
            });
        });
        
        const mediaIdsToFetch = imagesFromHtml.map(img => img.mediaId).filter((id): id is number => id !== null);
        let mediaDataMap = new Map<number, { alt_text: string }>();
        
        if (wpApi && mediaIdsToFetch.length > 0) {
            try {
                const mediaResponse = await wpApi.get('/media', {
                    params: { include: [...new Set(mediaIdsToFetch)].join(','), per_page: 100, _fields: 'id,alt_text' }
                });
                if (mediaResponse.data && Array.isArray(mediaResponse.data)) {
                    mediaResponse.data.forEach((mediaItem: any) => {
                        mediaDataMap.set(mediaItem.id, { alt_text: mediaItem.alt_text });
                    });
                }
            } catch (e) {
                console.warn("Could not fetch media details from WordPress API, falling back to scraped alt text.", e);
            }
        }
        
        const finalImages = imagesFromHtml.map(img => ({
            src: img.src,
            alt: img.mediaId && mediaDataMap.has(img.mediaId) ? mediaDataMap.get(img.mediaId)!.alt_text : img.alt,
        }));
        
        const uniqueImages = Array.from(new Map(finalImages.map(img => [img.src, img])).values());

        return {
            title: globalTitle,
            metaDescription,
            focusKeyword: '',
            canonicalUrl,
            h1: $analysisArea.find('h1').first().text(),
            headings: $analysisArea.find('h1, h2, h3, h4, h5, h6').map((i, el) => ({
                tag: (el as cheerio.TagElement).name,
                text: $(el).text()
            })).get(),
            images: uniqueImages,
            textContent: $analysisArea.text().replace(/\s\s+/g, ' ').trim(),
        };

    } catch (error: unknown) {
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
    const { wooApi, wpApi, prompts } = await getApiClientsForUser(uid);
    let pageData;

    if (postId && postType) {
        let post: any;
        
        const apiToUse = postType === 'Producto' ? wooApi : wpApi;
        if (!apiToUse) throw new Error(`API client for ${postType} is not configured.`);
        
        const endpoint = postType === 'Producto' ? `products/${postId}` : (postType === 'Post' ? `posts/${postId}` : `pages/${postId}`);
        const response = await apiToUse.get(endpoint, { params: { context: 'edit', '_': new Date().getTime() } });
        post = response.data;

        // Scrape the live page to get the most accurate image data and H1
        const livePageData = await getPageContentFromScraping(post.link, wpApi);

        const getMetaValue = (key: string) => {
            if (post.meta_data) { // WooCommerce format
                const meta = post.meta_data.find((m: any) => m.key === key);
                return meta ? meta.value : '';
            }
            return post.meta?.[key] || ''; // WordPress format
        };

        const yoastTitle = getMetaValue('_yoast_wpseo_title');
        
        // Combine content from different sources for a full picture
        const mainContentHtml = post.content?.rendered || post.description || '';
        const shortDescriptionHtml = post.short_description || '';
        const combinedHtml = `${shortDescriptionHtml} ${mainContentHtml}`;
        
        const $ = cheerio.load(combinedHtml);
        const textContent = $('body').text().replace(/\s\s+/g, ' ').trim();

        pageData = {
            title: yoastTitle || post.name || post.title?.rendered || '',
            metaDescription: getMetaValue('_yoast_wpseo_metadesc') || post.short_description?.replace(/<[^>]+>/g, '') || '',
            focusKeyword: getMetaValue('_yoast_wpseo_focuskw') || '',
            canonicalUrl: post.permalink || post.link || '',
            h1: livePageData.h1,
            headings: livePageData.headings,
            images: livePageData.images,
            textContent: textContent,
        };

    } else {
        const finalUrl = url.trim().startsWith('http') ? url : `https://${url}`;
        const urlWithCacheBust = new URL(finalUrl);
        urlWithCacheBust.searchParams.set('timestamp', Date.now().toString());
        pageData = await getPageContentFromScraping(urlWithCacheBust.toString(), wpApi);
    }
    
    if (!pageData.textContent || pageData.textContent.trim().length < 50) {
        throw new Error('No se encontró suficiente contenido textual en la página para analizar. Asegúrate de que la URL es correcta y tiene contenido visible.');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    
    const technicalAnalysisTemplate = Handlebars.compile(prompts.seoTechnicalAnalysis, { noEscape: true });
    const technicalAnalysisPrompt = technicalAnalysisTemplate({
        ...pageData,
        imagesWithoutAlt: pageData.images.filter((i: any) => !i.alt).length,
        textContent: pageData.textContent.substring(0, 300)
    });
  
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
    
    const interpretationTemplate = Handlebars.compile(prompts.seoInterpretation, { noEscape: true });
    let interpretationPrompt = interpretationTemplate({
        title: fullAnalysis.title,
        metaDescription: fullAnalysis.metaDescription,
        h1: fullAnalysis.h1,
        score: fullAnalysis.aiAnalysis.score,
        checksSummary: JSON.stringify(fullAnalysis.aiAnalysis.checks, null, 2),
    });

    if (score === 100) {
      interpretationPrompt = `You are a world-class SEO consultant analyzing a web page's on-page SEO data.
      The user has received a perfect score of 100/100, which is excellent.
      Your task is to provide a congratulatory and reassuring summary in Spanish.

      **Analysis Data:**
      - Page Title: "${fullAnalysis.title}"
      - SEO Score: 100/100
      - All technical checks passed.

      **Your Task:**
      Generate a JSON object with four keys: "interpretation", "actionPlan", "positives", "improvements".
      - "interpretation": Write a narrative paragraph in Spanish congratulating the user on the perfect score and explaining that all fundamental on-page SEO checks are correct.
      - "actionPlan": Return an array with a single string: "¡Felicidades! No se requieren acciones prioritarias. ¡Sigue así!".
      - "positives": Create a list of 3-4 key SEO strengths of the page (e.g., "Título y meta descripción bien optimizados", "Buena estructura de encabezados").
      - "improvements": Return an array with a single string: "Actualmente, no hay áreas de mejora urgentes basadas en nuestro checklist.".
      `;
    }
    
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
