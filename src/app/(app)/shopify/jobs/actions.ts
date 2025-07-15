
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';

export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string; details?: any }> {
    let context;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) throw new Error("User record not found in database.");
        const userData = userDoc.data();
        context = {
            uid: decodedToken.uid,
            role: userData?.role || null,
            companyId: userData?.companyId || null,
        };
    } catch (error: any) {
        console.error('Error verifying token in deleteShopifyJobsAction:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }

    if (!jobIds || jobIds.length === 0) {
        return { success: false, error: 'No job IDs provided for deletion.' };
    }

    const batch = adminDb.batch();
    const jobsCollection = adminDb.collection('shopify_creation_jobs');
    let authorizedDeletions = 0;

    for (const jobId of jobIds) {
        try {
            const jobRef = jobsCollection.doc(jobId);
            const doc = await jobRef.get();

            if (!doc.exists) continue; // Skip if already deleted

            const jobData = doc.data() as ShopifyCreationJob;
            let isAuthorized = false;

            if (context.role === 'super_admin') {
                isAuthorized = true;
            } else if (jobData.entity.type === 'user' && jobData.entity.id === context.uid) {
                isAuthorized = true;
            } else if (jobData.entity.type === 'company' && jobData.entity.id === context.companyId) {
                isAuthorized = true;
            }

            if (isAuthorized) {
                batch.delete(jobRef);
                authorizedDeletions++;
            }
        } catch (error: any) {
             console.error(`Skipping job ${jobId} due to error during permission check:`, error);
        }
    }
    
    if (authorizedDeletions === 0) {
        return { success: false, error: 'You do not have permission to delete any of the selected jobs.' };
    }

    try {
        await batch.commit();
        return { success: true };
    } catch (error: any) {
        console.error('Error committing batch delete for Shopify jobs:', error);
        return { success: false, error: 'A server error occurred during batch deletion.' };
    }
}
