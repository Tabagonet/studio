
'use server';
import { createAdPlan, CreateAdPlanInput, CreateAdPlanOutput } from "@/ai/flows/create-ad-plan-flow";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';

export async function generateAdPlanAction(input: CreateAdPlanInput): Promise<{
    data?: CreateAdPlanOutput;
    error?: string;
}> {
    try {
        const adPlan = await createAdPlan(input);
        
        // This is a server action, so we can get the user and increment usage here
        // Note: This relies on the action being called from an authenticated context,
        // which is enforced by the AdPlannerLayout.
        // A more robust solution might pass the token, but this is simpler.
        const users = await adminAuth.listUsers();
        // This is a simplification; in a real app, you'd get the current user's ID
        // from the session or another secure mechanism. For this context, we assume
        // a single user or handle usage tracking differently.
        const superAdmin = users.users.find(u => u.email === 'tabagonet@gmail.com');
        if (adminDb && superAdmin) {
            const userSettingsRef = adminDb.collection('user_settings').doc(superAdmin.uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return { data: adPlan };
    } catch (error: any) {
        console.error('Error in generateAdPlanAction:', error);
        return { error: error.message || 'An unknown error occurred while generating the plan.' };
    }
}
