

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
    ExecuteTaskInputSchema,
    KeywordResearchResultSchema,
    GenerateAdCreativesOutputSchema,
} from "./schema";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { generateStrategyTasks } from '@/ai/flows/generate-strategy-tasks-flow';
import { generateAdCreatives } from '@/ai/flows/generate-ad-creatives-flow';
import { competitorAnalysis } from "@/ai/flows/competitor-analysis-flow";
import { executeKeywordResearchTask } from "@/ai/flows/execute-keyword-research-task-flow";
import { z } from "zod";


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
            
            const { id, ...planDataToSave } = adPlan;
            
            const newPlanRef = await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ...planDataToSave
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
    console.log('[LOG] Server Action: generateAdCreativesAction triggered.');
    let uid: string;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        console.log(`[LOG] Server Action: User authenticated. UID: ${uid}`);
    } catch (error) {
        console.error('Error verifying token in generateAdCreativesAction:', error);
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        console.log('[LOG] Server Action: Calling generateAdCreatives flow with input:', input);
        const creatives = await generateAdCreatives(input);
        console.log('[LOG] Server Action: Flow returned creatives:', creatives);
        
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
            console.log('[LOG] Server Action: AI usage count incremented.');
        }
        
        console.log('[LOG] Server Action: Returning successful data to client.');
        return { data: creatives };
    } catch (error: any) {
        console.error('[LOG] Server Action: An error occurred in generateAdCreativesAction:', error);
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
    } catch (error: any) {
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


export async function deleteAdPlansAction(
    planIds: string[],
    token: string
): Promise<{ success: boolean; error?: string }> {
    let uid: string;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in deleteAdPlansAction:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }

    if (!planIds || planIds.length === 0) {
        return { success: false, error: 'No plan IDs provided for deletion.' };
    }

    try {
        const batch = adminDb.batch();
        const plansRef = adminDb.collection('ad_plans');
        
        if (planIds.length > 30) {
             return { success: false, error: 'No se pueden eliminar más de 30 planes a la vez.' };
        }

        const snapshot = await plansRef.where(admin.firestore.FieldPath.documentId(), 'in', planIds).get();
        
        let authorizedDeletions = 0;
        
        snapshot.docs.forEach(doc => {
            if (doc.data().userId === uid) {
                batch.delete(doc.ref);
                authorizedDeletions++;
            }
        });
        
        if (authorizedDeletions === 0 && planIds.length > 0) {
             return { success: false, error: 'Permission denied. You do not own any of the selected plans.' };
        }

        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error(`Error deleting plans:`, error);
        return { success: false, error: 'An unknown error occurred while deleting the plans.' };
    }
}

export async function executeTaskAction(
  input: z.infer<typeof ExecuteTaskInputSchema>,
  token: string
): Promise<{ data?: any; error?: string }> {
  let uid: string;
  try {
    if (!adminAuth) throw new Error('Firebase Admin not initialized');
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
    return { error: 'Authentication failed: ' + error.message };
  }

  try {
    const taskNameLower = input.taskName.toLowerCase();
    
    if (taskNameLower.includes('palabras clave') || taskNameLower.includes('keyword')) {
        const result = await executeKeywordResearchTask(input);
        return { data: result };
    }
    
    if (taskNameLower.includes('anuncios') || taskNameLower.includes('creativos') || taskNameLower.includes('copy')) {
      const creativeInput: GenerateAdCreativesInput = {
        url: input.url,
        objectives: [], // These are not available at the task level, can be omitted
        platform: 'General', // Not available at task level, use a general placeholder
        campaign_type: 'General',
        funnel_stage: 'Consideration',
        target_audience: input.buyerPersona,
      };
      const result = await generateAdCreatives(creativeInput);
      return { data: result };
    }

    // Default fallback for unimplemented tasks
    return { error: 'La ejecución para este tipo de tarea aún no está implementada.' };

  } catch (error: any) {
    console.error('Error in executeTaskAction:', error);
    return { error: error.message || 'An unknown error occurred while executing the task.' };
  }
}
