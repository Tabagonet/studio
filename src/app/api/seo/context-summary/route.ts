
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiClientsForUser } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

async function fetchAdPlanData(uid: string, url: string | null) {
    if (!adminDb) return null;
    try {
        let query = adminDb.collection('ad_plans').where('userId', '==', uid);
        
        if (url) {
            query = query.where('url', '==', url);
        }
        
        const adPlansSnapshot = await query.get();
            
        if (adPlansSnapshot.empty) return null;

        // Sort in-memory to find the most recent plan
        const sortedDocs = adPlansSnapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toDate() || 0;
            const dateB = b.data().createdAt?.toDate() || 0;
            return dateB - dateA;
        });
        
        const adPlan = sortedDocs[0].data();
        return {
            objectives: adPlan.objectives,
            valueProposition: adPlan.valueProposition,
            targetAudience: adPlan.targetAudience,
            priorityObjective: adPlan.priorityObjective,
            brandPersonality: adPlan.brandPersonality,
        };
    } catch(e) {
        console.error(`Error fetching ad plan data for url ${url}:`, e);
        return null;
    }
}

async function fetchSeoAnalysesData(uid: string) {
    if (!adminDb) return [];
    try {
        const analysesSnapshot = await adminDb.collection('seo_analyses')
            .where('userId', '==', uid)
            .limit(10) // Limit to a reasonable number to avoid large reads
            .get();

        if (analysesSnapshot.empty) return [];
        
        // Sort in-memory
        const sortedDocs = analysesSnapshot.docs.sort((a, b) => {
            const dateA = a.data().createdAt?.toDate() || 0;
            const dateB = b.data().createdAt?.toDate() || 0;
            return dateB - dateA;
        });

        return sortedDocs.map(doc => {
            const data = doc.data();
            return {
                title: data.analysis?.title,
                metaDescription: data.analysis?.metaDescription,
                focusKeyword: data.analysis?.aiAnalysis?.suggested?.focusKeyword,
            };
        }).filter(item => item.title || item.metaDescription || item.focusKeyword);
    } catch(e) {
        console.error('Error fetching SEO analyses data:', e);
        return [];
    }
}


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
        let activeUrl: string | null = null;
        try {
            const { settings } = await getApiClientsForUser(uid);
            const activeConnectionKey = settings?.activeConnectionKey;
            if (activeConnectionKey) {
                const activeConnection = settings?.connections?.[activeConnectionKey];
                activeUrl = activeConnection?.wooCommerceStoreUrl || activeConnection?.wordpressApiUrl || null;
            }
        } catch (e) {
             console.warn("Could not get active connection URL for context summary, proceeding without it.");
        }

        const adPlanData = await fetchAdPlanData(uid, activeUrl);
        const seoAnalysesData = await fetchSeoAnalysesData(uid);
        
        if (!adPlanData && seoAnalysesData.length === 0) {
            return NextResponse.json({ error: "No hay análisis previos (SEO o Publicidad) para generar un contexto. Por favor, describe tu negocio manualmente." }, { status: 404 });
        }
        
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

        const prompt = `
            Eres un analista de marketing experto. A continuación se presentan datos de análisis SEO y, opcionalmente, de un plan de publicidad para un negocio.
            Tu tarea es leerlos y sintetizarlos en una descripción concisa del negocio, su público objetivo y sus objetivos principales.
            La descripción debe ser clara y útil como contexto para generar una estrategia de contenidos.
            No inventes información que no esté presente. **Prioriza la información del plan de publicidad si está disponible, ya que es más explícita y estratégica.**

            **Datos del Plan de Publicidad (Fuente Principal):**
            ---
            ${adPlanData ? JSON.stringify(adPlanData, null, 2) : "No disponible."}
            ---

            **Datos de Análisis SEO (Fuente Secundaria para contexto adicional):**
            ---
            ${seoAnalysesData.length > 0 ? JSON.stringify(seoAnalysesData, null, 2) : "No disponible."}
            ---

            Ahora, genera un resumen conciso del negocio en un único párrafo.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

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
