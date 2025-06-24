
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';

const analyzeUrlSchema = z.object({
  url: z.string().min(1, "La URL no puede estar vacía."),
});

const aiResponseSchema = z.object({
  score: z.union([z.number(), z.string()]).transform(val => {
    const num = Number(val);
    return isNaN(num) ? 0 : num; // Safely convert to number, defaulting to 0 if invalid
  }).describe("Una puntuación SEO estimada de 0 a 100."),
  summary: z.string().describe("Un breve resumen sobre de qué trata la página."),
  positives: z.array(z.string()).describe("Una lista de 2-3 aspectos SEO positivos encontrados."),
  improvements: z.array(z.string()).describe("Una lista de las 2-3 sugerencias de mejora más importantes y accionables."),
});

// Helper function to fetch and parse the URL content with better error handling
async function getPageContent(url: string) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10-second timeout
        });

        const html = response.data;
        const $ = cheerio.load(html);

        // Remove script and style tags to clean up content for AI
        $('script, style').remove();

        const extractedData = {
            title: $('title').text(),
            metaDescription: $('meta[name="description"]').attr('content') || '',
            h1: $('h1').first().text(),
            headings: $('h1, h2, h3, h4, h5, h6').map((i, el) => ({
                tag: el.tagName,
                text: $(el).text()
            })).get(),
            images: $('img').map((i, el) => ({
                src: $(el).attr('src'),
                alt: $(el).attr('alt') || ''
            })).get(),
            textContent: $('body').text().replace(/\s\s+/g, ' ').trim(),
        };

        return extractedData;
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

// Helper function to call Google AI
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
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
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
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth) throw new Error("La autenticación del administrador de Firebase no está inicializada.");
    await adminAuth.verifyIdToken(token);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = analyzeUrlSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({ error: validation.error.flatten().fieldErrors.url?.[0] || 'URL inválida' }, { status: 400 });
    }

    let { url } = validation.data;
    
    // Robust URL formatting on the backend
    url = url.trim();
    if (!url.startsWith('http')) {
        url = `https://${url}`;
    }
    
    // 1. Scrape and parse the page
    const pageData = await getPageContent(url);
    
    // 2. Check if there's enough content to analyze
    if (!pageData.textContent || pageData.textContent.trim().length < 50) {
        throw new Error('No se encontró suficiente contenido textual en la página para analizar. Asegúrate de que la URL es correcta y tiene contenido visible.');
    }
    
    // 3. Get AI analysis
    const aiAnalysis = await getAiAnalysis(pageData.textContent);

    // 4. Combine results and send back to client
    const fullAnalysis = {
      title: pageData.title,
      metaDescription: pageData.metaDescription,
      h1: pageData.h1,
      headings: pageData.headings,
      images: pageData.images,
      aiAnalysis: aiAnalysis,
    };

    return NextResponse.json(fullAnalysis);

  } catch (error: any) {
    console.error('Error in analyze-url endpoint:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
