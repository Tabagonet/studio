

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
    GoogleAdsCampaignSchema,
    type GoogleAdsCampaign,
    GenerateGoogleCampaignInputSchema,
    type GenerateGoogleCampaignInput
} from "./schema";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { generateStrategyTasks } from '@/ai/flows/generate-strategy-tasks-flow';
import { generateAdCreatives } from '@/ai/flows/generate-ad-creatives-flow';
import { competitorAnalysis } from "@/ai/flows/competitor-analysis-flow";
import { executeKeywordResearchTask } from "@/ai/flows/execute-keyword-research-task-flow";
import { executeCampaignSetupTask } from "@/ai/flows/execute-campaign-setup-task-flow"; // Import new flow
import { generateGoogleCampaign } from "@/ai/flows/generate-google-campaign-flow";
import { z } from "zod";

async function getEntityRef(uid: string, cost: number): Promise<[FirebaseFirestore.DocumentReference]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId)];
    }
    return [adminDb.collection('user_settings').doc(uid)];
}

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
        const [entityRef] = await getEntityRef(uid, 5); // Ad Plan costs 5 credits
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(5) }, { merge: true });

        const adPlan = await createAdPlan(input, uid);
        
        if (adminDb) {
            const { id, ...planDataToSave } = adPlan;
            const newPlanRef = await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ...planDataToSave
            });
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
        const [entityRef] = await getEntityRef(uid, 2); // Tasks cost 2 credits
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(2) }, { merge: true });
        
        const tasks = await generateStrategyTasks(input);
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
        const [entityRef] = await getEntityRef(uid, 2); // Creatives cost 2 credits
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(2) }, { merge: true });

        const creatives = await generateAdCreatives(input);
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
        const [entityRef] = await getEntityRef(uid, 5); // Competitor Analysis costs 5 credits
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(5) }, { merge: true });
        
        const analysisData = await competitorAnalysis(input);
        
        if (!adminDb) {
             throw new Error("Database not available to save analysis.");
        }
        
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
            const docRef = existingQuery.docs[0].ref;
            await docRef.update(newAnalysisRecord);
            docId = docRef.id;
        } else {
            const newDocRef = await adminDb.collection('competitor_analyses').add(newAnalysisRecord);
            docId = newDocRef.id;
        }
        
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
    
    let result;
    if (taskNameLower.includes('keyword') || taskNameLower.includes('palabras clave')) {
        result = await executeKeywordResearchTask(input);
    } else if (taskNameLower.includes('anuncios') || taskNameLower.includes('creativos') || taskNameLower.includes('copy')) {
      const creativeInput: GenerateAdCreativesInput = {
        url: input.url,
        objectives: [], 
        platform: input.strategyPlatform || 'General',
        campaign_type: 'General',
        funnel_stage: 'Consideration',
        target_audience: input.buyerPersona,
      };
      result = await generateAdCreatives(creativeInput);
    } else if (taskNameLower.includes('configuraci') && taskNameLower.includes('campa')) {
      result = await executeCampaignSetupTask(input);
    } else {
        return { error: 'La ejecución para este tipo de tarea aún no está implementada.' };
    }
    
    const [entityRef] = await getEntityRef(uid, 1); // Task execution costs 1 credit
    await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });

    return { data: result };

  } catch (error: any) {
    console.error('Error in executeTaskAction:', error);
    return { error: error.message || 'An unknown error occurred while executing the task.' };
  }
}

export async function generateGoogleCampaignAction(
    input: GenerateGoogleCampaignInput, 
    token: string
): Promise<{
    data?: GoogleAdsCampaign;
    error?: string;
}> {
    let uid: string;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        return { error: 'Authentication failed. Unable to identify user.' };
    }

    try {
        const [entityRef] = await getEntityRef(uid, 10); // Campaign generation costs 10 credits
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(10) }, { merge: true });

        const campaign = await generateGoogleCampaign(input);
        return { data: campaign };
    } catch (error: any) {
        console.error('Error in generateGoogleCampaignAction:', error);
        return { error: error.message || 'An unknown error occurred while generating the campaign structure.' };
    }
}
