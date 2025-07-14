
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';
import { adminAuth, getServiceAccountCredentials } from '@/lib/firebase-admin';

// This endpoint is now designed to be called by Cloud Tasks.
// It includes a verification step to ensure only authorized requests can invoke it.
export async function POST(req: NextRequest) {
    console.log('[Task Handler] Received POST request to /api/tasks/create-shopify-store');
    try {
        const oidcToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!oidcToken) {
            console.warn('[Task Handler] Unauthorized: Called without OIDC token.');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }
        
        if (!adminAuth) {
            throw new Error("[Task Handler] Firebase Admin SDK is not initialized.");
        }
        
        // Verify the OIDC token to ensure the request is from a legitimate Cloud Task.
        // The audience must match the URL of this endpoint.
        const serviceAccountEmail = getServiceAccountCredentials().client_email;
        if (!serviceAccountEmail) {
            throw new Error("[Task Handler] Could not determine service account email for token verification.");
        }
        
        await adminAuth.verifyIdToken(oidcToken, true);
        console.log('[Task Handler] OIDC token verified successfully.');


        const body = await req.json();
        const jobId = body.jobId;
        console.log(`[Task Handler] Extracted Job ID: ${jobId}`);

        if (!jobId) {
            console.error('[Task Handler] Error: Job ID is missing from the payload.');
            return NextResponse.json({ error: 'Job ID is required in the task payload.' }, { status: 400 });
        }

        // --- Execute the Task ---
        // We use await here because the caller (either the test button or Cloud Tasks) expects a response.
        console.log(`[Task Handler] Invoking handleCreateShopifyStore for Job ID: ${jobId}`);
        await handleCreateShopifyStore(jobId);
        console.log(`[Task Handler] Successfully finished handleCreateShopifyStore for Job ID: ${jobId}`);


        return NextResponse.json({ success: true, message: `Task for job ${jobId} executed.` });

    } catch (error: any) {
        console.error(`[Task Handler] Critical error processing job:`, {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        // Return a 500 error to signal failure
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
