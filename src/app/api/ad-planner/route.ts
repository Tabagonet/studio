

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { createAdPlan } from '@/ai/flows/create-ad-plan-flow';
import { CreateAdPlanInputSchema } from '@/app/(app)/ad-planner/schema';

async function getEntityRef(uid: string): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const cost = 10; // Cost for generating an ad plan

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
}


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
        
        const [entityRef, cost] = await getEntityRef(uid);
        await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });

        const adPlan = await createAdPlan(validationResult.data, uid);
        
        if (adminDb) {
            const { id, ...planDataToSave } = adPlan;
            
            const newPlanRef = await adminDb.collection('ad_plans').add({
                userId: uid,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                ...planDataToSave
            });

            return NextResponse.json({ data: { ...adPlan, id: newPlanRef.id } });
        }
        
        return NextResponse.json({ data: adPlan });

    } catch (error: any) {
        console.error('🔥 Error in /api/ad-planner:', error);
        return NextResponse.json({ error: 'Failed to generate ad plan: ' + error.message }, { status: 500 });
    }
}
