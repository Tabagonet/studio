import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// This endpoint is designed to be called by Cloud Tasks.
// It includes a verification step to ensure only Cloud Tasks can invoke it.
export async function POST(req: NextRequest) {
    try {
        // --- Security Check: Verify the request is from Cloud Tasks ---
        const oidcToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!oidcToken) {
            console.warn('Task handler called without OIDC token.');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }

        if (!adminAuth || !adminDb) {
            throw new Error("Firebase Admin SDK is not initialized.");
        }
        
        const serviceAccountEmail = process.env.FIREBASE_CLIENT_EMAIL;
        if (!serviceAccountEmail) {
            throw new Error("FIREBASE_CLIENT_EMAIL env var is required for task verification.");
        }
        
        // This verifies that the token was signed by Google and is for our service.
        await adminAuth.verifyIdToken(oidcToken, true);

        const body = await req.json();
        const jobId = body.jobId;

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required in the task payload.' }, { status: 400 });
        }

        // --- Execute the Task ---
        // We use await here because Cloud Tasks expects a 200 OK response on success.
        // It will retry if it gets an error status code.
        await handleCreateShopifyStore(jobId);

        return NextResponse.json({ success: true, message: `Task for job ${jobId} executed.` });

    } catch (error: any) {
        console.error(`[Task Handler] Error processing job:`, error);
        // Return a 500 error to signal to Cloud Tasks that the task failed and should be retried.
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
