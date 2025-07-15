
// src/app/api/shopify/jobs/[jobId]/populate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, getServiceAccountCredentials } from '@/lib/firebase-admin';
import { CloudTasksClient } from '@google-cloud/tasks';

// Helper to check for admin/super_admin role
async function isAuthorized(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminAuth.getUser(decodedToken.uid);
        const role = userDoc.customClaims?.role;
        return role === 'admin' || role === 'super_admin';
    } catch {
        return false;
    }
}

// This endpoint acts as a secure trigger for the population task.
export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
    if (!await isAuthorized(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { jobId } = params;
    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }
    
    console.log(`[API Trigger] Received request to populate job ID: ${jobId}`);

    try {
        if (process.env.NODE_ENV === 'development') {
            // In development, directly call the logic for faster iteration
            console.log(`[API Trigger - Dev Mode] Calling population task directly for Job ID: ${jobId}`);
            const { populateShopifyStore } = require('@/lib/tasks/populate-shopify-store');
            // We don't await this so the response is immediate
            populateShopifyStore(jobId).catch((e: any) => console.error(`[DEV Direct Call] Error executing task for job ${jobId}:`, e));
        } else {
            // In production, enqueue a Cloud Task
            const tasksClient = new CloudTasksClient({
                credentials: getServiceAccountCredentials(),
                projectId: process.env.FIREBASE_PROJECT_ID,
            });
            const parent = tasksClient.queuePath(process.env.FIREBASE_PROJECT_ID!, 'europe-west1', 'autopress-jobs');
            const targetUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tasks/populate-shopify-store`;

            const task = {
                httpRequest: {
                    httpMethod: 'POST' as const,
                    url: targetUri,
                    headers: { 'Content-Type': 'application/json' },
                    body: Buffer.from(JSON.stringify({ jobId })).toString('base64'),
                    // The OIDC token is for authentication between Cloud Tasks and your service.
                    oidcToken: { serviceAccountEmail: getServiceAccountCredentials().client_email },
                },
                // Optional: set a schedule if needed
                // scheduleTime: { seconds: Date.now() / 1000 + 10 },
            };
            
            console.log(`[API Trigger - Prod Mode] Enqueueing Cloud Task for job ${jobId}. Target: ${targetUri}`);
            await tasksClient.createTask({ parent, task });
        }

        return NextResponse.json({ success: true, message: 'Population task has been successfully enqueued.' }, { status: 202 });

    } catch (error: any) {
        console.error(`[API Trigger] Error enqueuing task for job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to enqueue population task', details: error.message }, { status: 500 });
    }
}
