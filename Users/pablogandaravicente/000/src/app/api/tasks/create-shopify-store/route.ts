
import { NextRequest, NextResponse } from 'next/server';
import { handleCreateShopifyStore } from '@/lib/tasks/create-shopify-store';

// This endpoint is designed to be called by Cloud Tasks.
// It uses a shared secret for authentication.
export async function POST(req: NextRequest) {
    console.log('[Task Handler] Received POST request to /api/tasks/create-shopify-store.');
    
    try {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            console.error('[Task Handler] CRON_SECRET is not set on the server.');
            throw new Error("Server configuration error: secret not set.");
        }

        const { searchParams } = new URL(req.url);
        const secret = searchParams.get('secret');

        if (secret !== cronSecret) {
            console.error('[Task Handler] Unauthorized: Invalid secret provided.');
            return NextResponse.json({ error: 'Unauthorized: Invalid secret.' }, { status: 401 });
        }
        console.log('[Task Handler] Secret verified successfully.');

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
        return NextResponse.json({ error: 'Task execution failed', details: error.message }, { status: 500 });
    }
}
