
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';

// This endpoint is now designed to be called by Cloud Tasks.
export async function POST(req: NextRequest) {
    console.log('[Task Handler] Received POST request to /api/tasks/create-shopify-store.');
    
    try {
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

        // Return a success response to Cloud Tasks
        return NextResponse.json({ success: true, message: `Task for job ${jobId} executed.` }, { status: 200 });

    } catch (error: any) {
        console.error(`[Task Handler] Critical error processing job:`, {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        // Return a 500 error to signal failure, so Cloud Tasks will retry
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
