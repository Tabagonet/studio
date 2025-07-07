
'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function deleteProspectAction(prospectId: string, token: string): Promise<{ success: boolean; error?: string }> {
    let uid: string;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        // Future: Check user role here to ensure they are an admin.
    } catch (error) {
        console.error('Error verifying token in deleteProspectAction:', error);
        return { success: false, error: 'Authentication failed.' };
    }

    if (!prospectId) {
        return { success: false, error: 'Prospect ID is missing.' };
    }

    try {
        const prospectRef = adminDb.collection('prospects').doc(prospectId);
        // In a multi-tenant setup, you would first verify that the admin (`uid`)
        // has permission to delete this prospect (e.g., they belong to the same company).
        await prospectRef.delete();
        return { success: true };
    } catch (error: any) {
        console.error(`Error deleting prospect ${prospectId}:`, error);
        return { success: false, error: 'An unknown error occurred while deleting the prospect.' };
    }
}
