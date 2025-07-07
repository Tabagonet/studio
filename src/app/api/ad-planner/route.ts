
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { createAdPlan } from '@/ai/flows/create-ad-plan-flow';
import { CreateAdPlanInputSchema } from '@/app/(app)/ad-planner/schema';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) {
            return NextResponse.json({ error: 'Authentication token not provided.' }, { status: 401 });
        }
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed.' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validationResult = CreateAdPlanInputSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const adPlan = await createAdPlan(validationResult.data, uid);

        // Increment AI usage count
        if (adminDb) {
            const userSettingsRef = adminDb.collection('user_settings').doc(uid);
            await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
        }
        
        return NextResponse.json({ data: adPlan });

    } catch (error: any) {
        console.error('🔥 Error in /api/ad-planner:', error);
        return NextResponse.json({ error: 'Failed to generate ad plan: ' + error.message }, { status: 500 });
    }
}
