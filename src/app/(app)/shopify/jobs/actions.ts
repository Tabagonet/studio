
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';


export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string }> {
    let uid: string;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error) {
        console.error('Error verifying token in deleteShopifyJobsAction:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }

    if (!jobIds || jobIds.length === 0) {
        return { success: false, error: 'No job IDs provided for deletion.' };
    }

    try {
        const batch = adminDb.batch();
        const jobsRef = adminDb.collection('shopify_creation_jobs');
        
        // Firestore 'in' query limit is 30 in some SDKs, being safe
        if (jobIds.length > 30) {
             return { success: false, error: 'No se pueden eliminar más de 30 trabajos a la vez.' };
        }

        const snapshot = await jobsRef.where(adminDb.firestore.FieldPath.documentId(), 'in', jobIds).get();
        
        // This is a simplified authorization check. A more robust system would check
        // if the user's companyId matches the job's entity.id if it's a company job.
        let authorizedDeletions = 0;
        
        snapshot.docs.forEach(doc => {
            const jobData = doc.data() as ShopifyCreationJob;
            // Allow deletion if super_admin OR if the user is the entity for the job
            if (jobData.entity.id === uid) {
                 batch.delete(doc.ref);
                 authorizedDeletions++;
            }
            // Add your super_admin role check here if you have one
            // else if (user_is_super_admin) {
            //   batch.delete(doc.ref);
            //   authorizedDeletions++;
            // }
        });
        
        if (authorizedDeletions === 0 && jobIds.length > 0) {
             return { success: false, error: 'Permission denied. You do not own any of the selected jobs.' };
        }

        await batch.commit();

        return { success: true };
    } catch (error: any) {
        console.error(`Error deleting Shopify jobs:`, error);
        return { success: false, error: 'An unknown error occurred while deleting the jobs.' };
    }
}
