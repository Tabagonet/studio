
import { NextRequest, NextResponse } from 'next/server';
import { populateShopifyStore } from '@/lib/tasks/populate-shopify-store';
import { adminAuth } from '@/lib/firebase-admin';

// This endpoint is designed to be called by Cloud Tasks.
// It includes a verification step to ensure only Cloud Tasks can invoke it.
export async function POST(req: NextRequest) {
    try {
        // --- Security Check: Verify the request is from Cloud Tasks ---
        const oidcToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!oidcToken) {
            console.warn('Populate task handler called without OIDC token.');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }

        if (!adminAuth) {
            throw new Error("Firebase Admin SDK is not initialized.");
        }
        
        await adminAuth.verifyIdToken(oidcToken, true);

        const body = await req.json();
        const jobId = body.jobId;

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required in the task payload.' }, { status: 400 });
        }

        // --- Execute the Task ---
        await populateShopifyStore(jobId);

        return NextResponse.json({ success: true, message: `Population task for job ${jobId} executed.` });

    } catch (error: any) {
        console.error(`[Task Handler] Error processing population job:`, error);
        // Return a 500 error to signal to Cloud Tasks that the task failed and should be retried.
        return NextResponse.json({ error: 'Population task execution failed', details: error.message }, { status: 500 });
    }
}
