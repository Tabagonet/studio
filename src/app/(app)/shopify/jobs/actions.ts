
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';


export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string }> {
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
        
        if (jobIds.length > 30) {
             return { success: false, error: 'No se pueden eliminar más de 30 trabajos a la vez.' };
        }

        const snapshot = await jobsRef.where(adminDb.firestore.FieldPath.documentId(), 'in', jobIds).get();
        
        let authorizedDeletions = 0;
        
        snapshot.docs.forEach(doc => {
            const jobData = doc.data() as ShopifyCreationJob;
            
            let isAuthorized = false;
            if (context.role === 'super_admin') {
                isAuthorized = true;
            } else if (jobData.entity.type === 'company' && jobData.entity.id === context.companyId) {
                isAuthorized = true;
            } else if (jobData.entity.type === 'user' && jobData.entity.id === context.uid) {
                isAuthorized = true;
            }

            if (isAuthorized) {
                batch.delete(doc.ref);
                authorizedDeletions++;
            }
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
