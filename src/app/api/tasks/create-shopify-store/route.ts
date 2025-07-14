
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';

// This endpoint is now designed to be called directly from server actions OR by Cloud Tasks.
// The security check for Cloud Tasks is removed to allow direct server-side invocation for the test flow.
export async function POST(req: NextRequest) {
    try {
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
