
'use server';

import { adminAuth } from '@/lib/firebase-admin';

export async function deleteShopifyJobsAction(
    jobIds: string[],
    token: string
): Promise<{ success: boolean; error?: string; details?: any }> {
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

    const results = {
        success: 0,
        failed: 0,
        errors: [] as { jobId: string, message: string }[],
    };

    for (const jobId of jobIds) {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/jobs/${jobId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                // Try to parse error, but handle cases where body is empty
                let errorMessage = `Failed with status ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } catch (e) {
                    // Ignore JSON parsing error if body is empty
                }
                console.warn(`Failed to delete job ${jobId}:`, errorMessage);
                results.failed++;
                results.errors.push({ jobId, message: errorMessage });
            } else {
                results.success++;
            }
        } catch (error: any) {
             console.error(`Error processing delete for job ${jobId}:`, error);
             results.failed++;
             results.errors.push({ jobId, message: error.message || 'Unknown fetch error' });
        }
    }
    
    if (results.failed > 0) {
        return { success: false, error: `Failed to delete ${results.failed} job(s).`, details: results.errors };
    }

    return { success: true };
}
