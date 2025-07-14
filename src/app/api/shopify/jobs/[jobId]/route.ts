
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { ShopifyCreationJob } from '@/lib/types';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User record not found in database.");
    const userData = userDoc.data();
    return {
        uid: uid,
        role: userData?.role || null,
        companyId: userData?.companyId || null,
    };
}

export async function DELETE(req: NextRequest, { params }: { params: { jobId: string } }) {
    let context;
    try {
        context = await getUserContext(req);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 401 });
    }

    const { jobId } = params;
    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required.' }, { status: 400 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
        const doc = await jobRef.get();

        if (!doc.exists) {
            return NextResponse.json({ success: true, message: 'Job already deleted.' });
        }

        const jobData = doc.data() as ShopifyCreationJob;
        let isAuthorized = false;

        // A super admin can delete any job.
        if (context.role === 'super_admin') {
            isAuthorized = true;
        } 
        // A user can delete a job assigned to them.
        else if (jobData.entity.type === 'user' && jobData.entity.id === context.uid) {
            isAuthorized = true;
        }
        // An admin can delete a job assigned to their company.
        else if (jobData.entity.type === 'company' && jobData.entity.id === context.companyId) {
             isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden: You do not have permission to delete this job.' }, { status: 403 });
        }
        
        await jobRef.delete();

        return NextResponse.json({ success: true, message: `Job ${jobId} deleted successfully.` });

    } catch (error: any) {
        console.error(`Error deleting Shopify job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to delete job', details: error.message }, { status: 500 });
    }
}
