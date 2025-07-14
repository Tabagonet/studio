
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';
import { adminAuth } from '@/lib/firebase-admin';


// This endpoint is designed to be called by Cloud Tasks.
// It includes a verification step to ensure only Cloud Tasks can invoke it.
export async function POST(req: NextRequest) {
    console.log('[Task Handler] Received POST request to /api/tasks/create-shopify-store.');
    
    try {
        // --- Security Check: Verify the request is from Cloud Tasks ---
        const oidcToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!oidcToken) {
            console.warn('[Task Handler] Unauthorized: Called without OIDC token.');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }

        if (!adminAuth) {
            throw new Error("Firebase Admin SDK is not initialized.");
        }
        
        await adminAuth.verifyIdToken(oidcToken, true);
        console.log("[Task Handler] OIDC Token Verified.");

        const body = await req.json();
        const jobId = body.jobId;
        console.log(`[Task Handler] Extracted Job ID: ${jobId}`);

        if (!jobId) {
            console.error('[Task Handler] Error: Job ID is missing from the payload.');
            return NextResponse.json({ error: 'Job ID is required in the task payload.' }, { status: 400 });
        }

        // --- Execute the Task ---
        console.log(`[Task Handler] Invoking handleCreateShopifyStore for Job ID: ${jobId}`);
        await handleCreateShopifyStore(jobId);
        console.log(`[Task Handler] Successfully finished handleCreateShopifyStore for Job ID: ${jobId}`);

        return NextResponse.json({ success: true, message: `Task for job ${jobId} executed.` }, { status: 200 });

    } catch (error: any) {
        console.error(`[Task Handler] Critical error processing job:`, {
            message: error.message,
            stack: error.stack,
        });
        // Return a 500 error to signal to Cloud Tasks that the task failed and should be retried.
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
