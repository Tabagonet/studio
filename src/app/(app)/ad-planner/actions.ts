
'use server';
import { createAdPlan } from "@/ai/flows/create-ad-plan-flow";
import { 
    CreateAdPlanInput, 
    CreateAdPlanOutput, 
    type GenerateStrategyTasksInput,
    type GenerateStrategyTasksOutput,
} from "./schema";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { generateStrategyTasks } from '@/ai/flows/generate-strategy-tasks-flow';


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
            
            // Save the generated plan to a new collection
            const newPlanRef = await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                planData: adPlan,
                url: input.url,
                objectives: input.objectives,
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
        
        // We can increment usage count here as well
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
        // Security check to ensure the user owns the plan they're trying to save.
        if (doc.data()?.userId !== uid) {
            return { success: false, error: 'Permission denied. You do not own this plan.' };
        }
        
        // Sanitize the object to remove any `undefined` values that Firestore cannot handle.
        const sanitizedPlanData = JSON.parse(JSON.stringify(planData));

        await planRef.update({
            planData: sanitizedPlanData,
            url: plan.url,
            objectives: plan.objectives,
        });

        return { success: true };
    } catch (error: any) {
        console.error(`Error saving plan ${id}:`, error);
        return { success: false, error: 'An unknown error occurred while saving the plan.' };
    }
}
