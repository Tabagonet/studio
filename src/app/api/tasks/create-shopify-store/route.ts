
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';
import { adminAuth, getServiceAccountCredentials } from '@/lib/firebase-admin';

// This endpoint is now designed to be called by Cloud Tasks.
// It includes a verification step to ensure only authorized requests can invoke it.
export async function POST(req: NextRequest) {
    try {
        const oidcToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!oidcToken) {
            console.warn('Create store task handler called without OIDC token.');
            return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
        }
        
        if (!adminAuth) {
            throw new Error("Firebase Admin SDK is not initialized.");
        }
        
        // Verify the OIDC token to ensure the request is from a legitimate Cloud Task.
        // The audience must match the URL of this endpoint.
        try {
            await adminAuth.verifyIdToken(oidcToken, true);
        } catch (authError: any) {
             console.error('[Task Auth Error] Failed to verify OIDC token:', authError.message);
             return NextResponse.json({ error: 'Unauthorized: Invalid token', details: authError.message }, { status: 401 });
        }


        const body = await req.json();
        const jobId = body.jobId;

        if (!jobId) {
            return NextResponse.json({ error: 'Job ID is required in the task payload.' }, { status: 400 });
        }

        // --- Execute the Task ---
        // We use await here because the caller (either the test button or Cloud Tasks) expects a response.
        await handleCreateShopifyStore(jobId);

        return NextResponse.json({ success: true, message: `Task for job ${jobId} executed.` });

    } catch (error: any) {
        console.error(`[Task Handler] Error processing job:`, error);
        // Return a 500 error to signal failure
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
