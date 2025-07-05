
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
            await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                planData: adPlan,
                url: input.url,
                objectives: input.objectives,
            });
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
