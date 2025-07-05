
'use server';
import { createAdPlan } from "@/ai/flows/create-ad-plan-flow";
import { 
    CreateAdPlanInput, 
    CreateAdPlanOutput, 
    type GenerateStrategyTasksInput,
    type GenerateStrategyTasksOutput,
    type GenerateAdCreativesInput,
    type GenerateAdCreativesOutput,
    type CompetitorAnalysisInput,
    type CompetitorAnalysisOutput,
} from "./schema";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { generateStrategyTasks } from '@/ai/flows/generate-strategy-tasks-flow';
import { generateAdCreatives } from '@/ai/flows/generate-ad-creatives-flow';
import { competitorAnalysis } from "@/ai/flows/competitor-analysis-flow";


export async function generateAdPlanAction(
    input: CreateAdPlanInput, 
    token: string
): Promise<{
    data?: CreateAdPlanOutput;
    error?: string;
}> {
    let uid: string;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in generateAdPlanAction:', error);
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        const adPlan = await createAdPlan(input, uid);
        
        if (adminDb) {
            // Increment AI usage count
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
            
            // Save the generated plan to a new collection with a flattened structure
            const { id, ...planDataToSave } = adPlan; // id is undefined here, which is fine
            
            const newPlanRef = await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                url: planDataToSave.url,
                objectives: planDataToSave.objectives,
                executive_summary: planDataToSave.executive_summary,
                target_audience: planDataToSave.target_audience,
                strategies: planDataToSave.strategies,
                total_monthly_budget: planDataToSave.total_monthly_budget,
                calendar: planDataToSave.calendar,
                kpis: planDataToSave.kpis,
                fee_proposal: planDataToSave.fee_proposal,
                additional_context: planDataToSave.additional_context,
            });

            // Return the plan with its new ID
            return { data: { ...adPlan, id: newPlanRef.id } };
        }
        
        return { data: adPlan };
    } catch (error: any) {
        console.error('Error in generateAdPlanAction:', error);
        return { error: error.message || 'An unknown error occurred while generating the plan.' };
    }
}


export async function generateStrategyTasksAction(
    input: GenerateStrategyTasksInput, 
    token: string
): Promise<{
    data?: GenerateStrategyTasksOutput;
    error?: string;
}> {
    let uid: string;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in generateStrategyTasksAction:', error);
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        const tasks = await generateStrategyTasks(input);
        
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return { data: tasks };
    } catch (error: any) {
        console.error('Error in generateStrategyTasksAction:', error);
        return { error: error.message || 'An unknown error occurred while generating tasks.' };
    }
}

export async function generateAdCreativesAction(
    input: GenerateAdCreativesInput, 
    token: string
): Promise<{
    data?: GenerateAdCreativesOutput;
    error?: string;
}> {
    let uid: string;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in generateAdCreativesAction:', error);
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        const creatives = await generateAdCreatives(input);
        
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return { data: creatives };
    } catch (error: any) {
        console.error('Error in generateAdCreativesAction:', error);
        return { error: error.message || 'An unknown error occurred while generating creatives.' };
    }
}


export async function saveAdPlanAction(
    plan: CreateAdPlanOutput,
    token: string
): Promise<{ success: boolean; error?: string }> {
    let uid: string;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in saveAdPlanAction:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }
    
    const { id, ...planData } = plan;
    if (!id) {
        return { success: false, error: 'Plan ID is missing. Cannot save.' };
    }

    try {
        const planRef = adminDb.collection('ad_plans').doc(id);
        const doc = await planRef.get();

        if (!doc.exists) {
            return { success: false, error: 'Plan not found.' };
        }
        
        if (doc.data()?.userId !== uid) {
            return { success: false, error: 'Permission denied. You do not own this plan.' };
        }
        
        const sanitizedPlanData = JSON.parse(JSON.stringify(planData));

        await planRef.update(sanitizedPlanData);

        return { success: true };
    } catch (error: any) {
        console.error(`Error saving plan ${id}:`, error);
        return { success: false, error: 'An unknown error occurred while saving the plan.' };
    }
}


export async function competitorAnalysisAction(
    input: CompetitorAnalysisInput,
    token: string
): Promise<{
    data?: CompetitorAnalysisOutput & { id: string; createdAt: string; };
    error?: string;
}> {
    let uid: string;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in competitorAnalysisAction:', error);
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        // 1. Generate the new analysis
        const analysisData = await competitorAnalysis(input);
        
        if (!adminDb) {
             throw new Error("Database not available to save analysis.");
        }
        
        // 2. Increment AI usage count
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });

        // 3. Prepare record for saving
        const newAnalysisRecord = {
            userId: uid,
            url: input.url,
            analysis: analysisData,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const existingQuery = await adminDb.collection('competitor_analyses')
            .where('userId', '==', uid)
            .where('url', '==', input.url)
            .limit(1)
            .get();

        let docId: string;
        if (!existingQuery.empty) {
            // Update existing document
            const docRef = existingQuery.docs[0].ref;
            await docRef.update(newAnalysisRecord);
            docId = docRef.id;
        } else {
            // Create new document
            const newDocRef = await adminDb.collection('competitor_analyses').add(newAnalysisRecord);
            docId = newDocRef.id;
        }
        
        // 4. Return the new analysis with its ID and timestamp for the client
        return { 
            data: {
                id: docId,
                createdAt: new Date().toISOString(), // Immediate feedback for client
                ...analysisData
            } 
        };
        
    } catch (error: any) {
        console.error('Error in competitorAnalysisAction:', error);
        return { error: error.message || 'An unknown error occurred while analyzing competitors.' };
    }
}
