
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
  score: z.number().describe("An estimated SEO score from 0 to 100."),
  summary: z.string().describe("A brief summary of what the page is about."),
  positives: z.array(z.string()).describe("A list of 2-3 positive SEO aspects found."),
  improvements: z.array(z.string()).describe("A list of the top 2-3 actionable improvement suggestions."),
});

// Helper function to fetch and parse the URL content
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
        console.error(`Failed to fetch or parse URL: ${url}`, error);
        throw new Error('No se pudo acceder o analizar la URL. Asegúrate de que es pública y correcta.');
    }
}

// Helper function to call Google AI
async function getAiAnalysis(content: string) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error('La clave API de Google AI no está configurada en el servidor.');
  }

  const prompt = `
    Analyze the following webpage content for on-page SEO. Provide a response in Spanish as a single, valid JSON object.
    
    JSON Schema:
    ${JSON.stringify(aiResponseSchema.shape, null, 2)}

    Content to Analyze:
    ---
    ${content.substring(0, 30000)} 
    ---
  `;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash-latest",
    generationConfig: { responseMimeType: "application/json" },
  });

  try {
    const result = await model.generateContent(prompt);
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
    
    // 2. Get AI analysis
    const aiAnalysis = await getAiAnalysis(pageData.textContent);

    // 3. Combine results and send back to client
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
