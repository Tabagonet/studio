
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';

async function getUserContext(token: string): Promise<{ uid: string; role: string | null; companyId: string | null; }> {
    console.log('[Action - getUserContext] Verifying token...');
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
        console.warn(`[Action - getUserContext] User record not found for UID: ${decodedToken.uid}`);
        throw new Error("User record not found in database.");
    }
    const userData = userDoc.data();
    console.log(`[Action - getUserContext] Fetched user context: UID=${decodedToken.uid}, Role=${userData?.role}, CompanyID=${userData?.companyId}`);
    return {
        uid: decodedToken.uid,
        role: userData?.role || null,
        companyId: userData?.companyId || null,
    };
}

export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string; details?: any }> {
    let context;
    try {
        console.log(`[Action - deleteShopifyJobs] Starting deletion for ${jobIds.length} job(s).`);
        context = await getUserContext(token);
    } catch (error: any) {
        console.error('[Action - deleteShopifyJobs] Error verifying token:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }

    if (!jobIds || jobIds.length === 0) {
        return { success: false, error: 'No job IDs provided for deletion.' };
    }
    if (!adminDb) {
        return { success: false, error: 'Firestore is not initialized.' };
    }

    const batch = adminDb.batch();
    const jobsCollection = adminDb.collection('shopify_creation_jobs');
    let authorizedDeletions = 0;

    for (const jobId of jobIds) {
        try {
            console.log(`[Action - deleteShopifyJobs] Processing job ID: ${jobId}`);
            const jobRef = jobsCollection.doc(jobId);
            const doc = await jobRef.get();

            if (!doc.exists) {
                console.warn(`[Action - deleteShopifyJobs] Job ${jobId} not found, skipping.`);
                continue;
            }

            const jobData = doc.data() as ShopifyCreationJob;
            console.log(`[Action - deleteShopifyJobs] Job ${jobId} Entity:`, jobData.entity);

            let isAuthorized = false;
            
            const isSuperAdmin = context.role === 'super_admin';
            console.log(`[Action - deleteShopifyJobs] Checking Super Admin: ${isSuperAdmin}`);
            if (isSuperAdmin) {
                isAuthorized = true;
            }

            if (!isAuthorized && jobData.entity.type === 'user') {
                const isOwner = jobData.entity.id === context.uid;
                console.log(`[Action - deleteShopifyJobs] Checking User Ownership: Job owner=${jobData.entity.id}, Current user=${context.uid}. Is owner: ${isOwner}`);
                if (isOwner) isAuthorized = true;
            }

            if (!isAuthorized && jobData.entity.type === 'company' && context.role === 'admin') {
                const isAdminOfCompany = jobData.entity.id === context.companyId;
                console.log(`[Action - deleteShopifyJobs] Checking Company Admin: Job company=${jobData.entity.id}, Admin's company=${context.companyId}. Is admin: ${isAdminOfCompany}`);
                if (isAdminOfCompany) isAuthorized = true;
            }

            if (isAuthorized) {
                console.log(`[Action - deleteShopifyJobs] PERMISSION GRANTED for job ${jobId}. Adding to delete batch.`);
                batch.delete(jobRef);
                authorizedDeletions++;
            } else {
                 console.warn(`[Action - deleteShopifyJobs] PERMISSION DENIED for job ${jobId}.`);
            }
        } catch (error: any) {
             console.error(`[Action - deleteShopifyJobs] Skipping job ${jobId} due to error during permission check:`, error);
        }
    }
    
    if (authorizedDeletions === 0 && jobIds.length > 0) {
        const errorMessage = 'No tienes permiso para borrar ninguno de los trabajos seleccionados.';
        console.error(`[Action - deleteShopifyJobs] Final result: ${errorMessage}`);
        return { success: false, error: errorMessage };
    }
    
    try {
        console.log(`[Action - deleteShopifyJobs] Committing batch to delete ${authorizedDeletions} jobs.`);
        await batch.commit();
        let message = `Se eliminaron ${authorizedDeletions} trabajo(s).`;
        if (authorizedDeletions < jobIds.length) {
            message += ` No tenías permiso para los ${jobIds.length - authorizedDeletions} restantes.`
        }
        console.log(`[Action - deleteShopifyJobs] Batch commit successful.`);
        return { success: true, error: authorizedDeletions < jobIds.length ? message : undefined };
    } catch (error: any) {
        console.error('[Action - deleteShopifyJobs] Error committing batch delete:', error);
        return { success: false, error: 'A server error occurred during batch deletion.' };
    }
}
