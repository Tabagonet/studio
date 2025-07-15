
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided.');
        if (!adminAuth) throw new Error("Firebase Admin is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Authentication failed', message: e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }

    try {
        const analysesSnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .orderBy('createdAt', 'desc')
            .limit(10) // Get the last 10 analyses
            .get();

        if (analysesSnapshot.empty) {
            return NextResponse.json({ error: "No hay análisis SEO previos para generar un contexto. Por favor, describe tu negocio manualmente." }, { status: 404 });
        }
        
        const analysesData = analysesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                title: data.analysis.title,
                metaDescription: data.analysis.metaDescription,
                focusKeyword: data.analysis.aiAnalysis.suggested.focusKeyword,
            };
        });

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const prompt = `
            Eres un analista de marketing experto. A continuación se presentan los datos de varios análisis SEO de un mismo sitio web. 
            Tu tarea es leerlos y sintetizarlos en una descripción concisa del negocio, su público objetivo y sus objetivos principales.
            La descripción debe ser clara y útil como contexto para generar una estrategia de contenidos.
            No inventes información que no esté presente.

            **Datos de Análisis SEO:**
            ---
            ${JSON.stringify(analysesData, null, 2)}
            ---

            Ahora, genera un resumen conciso del negocio.
        `;
        
        const result = await model.generateContent(prompt);
        const summary = result.response.text();

        // Increment AI usage count
        await adminDb.collection('user_settings').doc(uid).set({ 
            aiUsageCount: admin.firestore.FieldValue.increment(1) 
        }, { merge: true });

        return NextResponse.json({ summary });

    } catch (error: any) {
        console.error('Error generating context summary:', error);
        return NextResponse.json({ error: 'Failed to generate context summary from past analyses.', details: error.message }, { status: 500 });
    }
}
