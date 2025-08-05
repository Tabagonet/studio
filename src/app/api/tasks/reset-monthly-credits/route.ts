
// /src/app/api/tasks/reset-monthly-credits/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// This endpoint is designed to be called by a trusted service like Google Cloud Scheduler.
// It includes a security check to ensure it's not publicly accessible.
export async function GET(req: NextRequest) {
    // SECURITY CHECK: Ensure the request is coming from Google Cloud Scheduler
    const isCronRequest = req.headers.get('x-appengine-cron') === 'true';
    const isLocalDev = process.env.NODE_ENV === 'development';

    if (!isCronRequest && !isLocalDev) {
        console.warn('Unauthorized attempt to access credit reset endpoint.');
        return NextResponse.json({ error: 'Forbidden: This endpoint is for internal use only.' }, { status: 403 });
    }

    if (!adminDb) {
        console.error('Credit Reset Task: Firestore is not configured.');
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    console.log('Starting monthly credit reset task...');

    try {
        let batch = adminDb.batch();
        let writeCount = 0;
        const commitPromises = [];

        // Reset Company usage
        const companiesSnapshot = await adminDb.collection('companies').get();
        companiesSnapshot.forEach(doc => {
            batch.update(doc.ref, { aiUsageCount: 0 });
            writeCount++;
            if (writeCount >= 499) { // Firestore batch limit is 500 writes
                commitPromises.push(batch.commit());
                batch = adminDb.batch();
                writeCount = 0;
            }
        });
        console.log(`Companies to reset: ${companiesSnapshot.size}`);

        // Reset individual User usage
        const usersSnapshot = await adminDb.collection('user_settings').get();
        usersSnapshot.forEach(doc => {
            batch.update(doc.ref, { aiUsageCount: 0 });
            writeCount++;
            if (writeCount >= 499) {
                commitPromises.push(batch.commit());
                batch = adminDb.batch();
                writeCount = 0;
            }
        });
        console.log(`Individual users to reset: ${usersSnapshot.size}`);

        // Commit any remaining writes in the last batch
        if (writeCount > 0) {
            commitPromises.push(batch.commit());
        }

        await Promise.all(commitPromises);

        const totalResets = companiesSnapshot.size + usersSnapshot.size;
        console.log(`Monthly credit reset task completed successfully. Total entities reset: ${totalResets}`);
        
        return NextResponse.json({ success: true, message: `Successfully reset monthly AI credit usage for ${totalResets} entities.` });

    } catch (error: any) {
        console.error('Error during monthly credit reset task:', error);
        return NextResponse.json({ error: 'Failed to reset credits', details: error.message }, { status: 500 });
    }
}
