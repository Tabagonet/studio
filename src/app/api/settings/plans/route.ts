
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { NAV_GROUPS } from '@/lib/constants';

// Define the structure of a plan
const planSchema = z.object({
    id: z.enum(['lite', 'pro', 'agency']),
    name: z.string(),
    price: z.string(),
    features: z.record(z.boolean()), // Maps tool href to boolean
});

const plansUpdateSchema = z.object({
    plans: z.array(planSchema)
});

// Helper to get default plan configuration from constants
const getDefaultPlans = () => {
    const defaultPlans: any[] = [
        { id: 'lite', name: 'Plan Lite', price: '29€/mes', features: {} },
        { id: 'pro', name: 'Plan Pro', price: '49€/mes', features: {} },
        { id: 'agency', name: 'Plan Agency', price: '99€/mes', features: {} },
    ];
    
    const allTools = NAV_GROUPS.flatMap(group => 
        group.items.filter(item => item.requiredPlan)
    );

    allTools.forEach(tool => {
        defaultPlans.forEach(plan => {
            if (tool.requiredPlan?.includes(plan.id)) {
                plan.features[tool.href] = true;
            }
        });
    });
    
    return defaultPlans;
};


async function isSuperAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'super_admin';
    } catch {
        return false;
    }
}


export async function GET(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }
    
    try {
        const docRef = adminDb.collection('config').doc('plans');
        const doc = await docRef.get();

        if (!doc.exists) {
            const defaultPlans = getDefaultPlans();
            await docRef.set({ plans: defaultPlans });
            return NextResponse.json({ plans: defaultPlans });
        }
        
        return NextResponse.json(doc.data());

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


export async function POST(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const validation = plansUpdateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }

        const docRef = adminDb.collection('config').doc('plans');
        await docRef.set(validation.data, { merge: true });
        
        return NextResponse.json({ success: true, message: "Plan configuration updated." });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
