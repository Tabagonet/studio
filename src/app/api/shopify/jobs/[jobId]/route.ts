
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
        return NextResponse.json({ error: 'Unauthorized: ' + e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { jobId } = params;
    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    try {
        const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
        const doc = await jobRef.get();

        if (!doc.exists) {
            return NextResponse.json({ success: true, message: 'Job already deleted.' });
        }
        
        const jobData = doc.data();

        // Authorization check
        let isAuthorized = false;
        if (context.role === 'super_admin') {
            isAuthorized = true;
        } else if (jobData?.entity.type === 'company' && jobData?.entity.id === context.companyId) {
            isAuthorized = true;
        } else if (jobData?.entity.type === 'user' && jobData?.entity.id === context.uid) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden: You do not have permission to delete this job.' }, { status: 403 });
        }
        
        await jobRef.delete();

        return NextResponse.json({ success: true, message: 'Job deleted successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error deleting job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to delete job', details: errorMessage }, { status: 500 });
    }
}
