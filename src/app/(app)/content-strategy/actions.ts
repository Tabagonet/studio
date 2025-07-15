'use server';

import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function deleteStrategyPlanAction(
  planId: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  let uid: string;
  try {
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error) {
    console.error('Error verifying token in deleteStrategyPlanAction:', error);
    return { success: false, error: 'Authentication failed.' };
  }

  if (!planId) {
    return { success: false, error: 'Plan ID is missing.' };
  }

  try {
    const planRef = adminDb.collection('content_strategy_plans').doc(planId);
    const doc = await planRef.get();
    if (!doc.exists) {
        return { success: true, error: 'Plan already deleted.' };
    }
    // Security check: ensure user owns the plan
    if (doc.data()?.userId !== uid) {
        return { success: false, error: 'Permission denied.' };
    }

    await planRef.delete();
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting content strategy plan ${planId}:`, error);
    return { success: false, error: 'An unknown error occurred while deleting the plan.' };
  }
}
