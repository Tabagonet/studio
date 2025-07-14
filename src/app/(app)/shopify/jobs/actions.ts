
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string }> {
    // Auth check to ensure user is logged in. Specific permissions are checked in the API endpoint.
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        await adminAuth.verifyIdToken(token);
    } catch (error) {
        console.error('Error verifying token in deleteShopifyJobsAction:', error);
        return { success: false, error: 'Authentication failed. Unable to identify user.' };
    }

    if (!jobIds || jobIds.length === 0) {
        return { success: false, error: 'No job IDs provided for deletion.' };
    }

    try {
        // Since we now have a dedicated API endpoint, we can simplify this.
        // For batch deletion, we'll just loop and call the single delete endpoint.
        // This is less efficient for huge batches but much simpler and reuses logic.
        for (const jobId of jobIds) {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/jobs/${jobId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                 const errorData = await response.json();
                 console.warn(`Failed to delete job ${jobId}:`, errorData.error);
                 // We can decide to stop on first error or continue. Let's continue.
            }
        }
        
        return { success: true };

    } catch (error: any) {
        console.error(`Error deleting Shopify jobs:`, error);
        return { success: false, error: 'An unknown error occurred while deleting the jobs.' };
    }
}
