
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

async function getUserIdFromRequest(req: NextRequest): Promise<string | null> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return null;
    try {
        if (!adminAuth) throw new Error("Firebase Admin Auth not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        return decodedToken.uid;
    } catch {
        return null;
    }
}

export async function DELETE(req: NextRequest, { params }: { params: { jobId: string } }) {
    const uid = await getUserIdFromRequest(req);
    if (!uid) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

        // Simple security check: user can only delete their own jobs.
        // A more complex check would involve roles and company affiliations.
        if (doc.data()?.entity.id !== uid) {
            return NextResponse.json({ error: 'Forbidden: You can only delete your own jobs.' }, { status: 403 });
        }

        await jobRef.delete();

        return NextResponse.json({ success: true, message: 'Job deleted successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error(`Error deleting job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to delete job', details: errorMessage }, { status: 500 });
    }
}
