
'use server';
import { createAdPlan } from "@/ai/flows/create-ad-plan-flow";
import { CreateAdPlanInput, CreateAdPlanOutput } from "./schema";
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { headers } from 'next/headers';


async function getUidFromRequest(): Promise<string | null> {
    const authorization = headers().get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
        return null;
    }
    const token = authorization.split('Bearer ')[1];
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in generateAdPlanAction:', error);
        return null;
    }
}

export async function generateAdPlanAction(input: CreateAdPlanInput): Promise<{
    data?: CreateAdPlanOutput;
    error?: string;
}> {
    try {
        const uid = await getUidFromRequest();
        if (!uid) {
            return { error: 'Authentication failed. Unable to identify user.' };
        }

        const adPlan = await createAdPlan(input, uid);
        
        // This is a server action, so we can increment usage here.
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return { data: adPlan };
    } catch (error: any) {
        console.error('Error in generateAdPlanAction:', error);
        return { error: error.message || 'An unknown error occurred while generating the plan.' };
    }
}
