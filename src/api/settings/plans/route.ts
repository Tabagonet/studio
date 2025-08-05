
      
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { NAV_GROUPS } from '@/lib/constants';

// Define the structure of a plan
const planSchema = z.object({
    id: z.enum(['lite', 'pro', 'agency']),
    name: z.string(),
    price: z.string(),
    sites: z.number().int().min(0),
    users: z.number().int().min(0),
    aiCredits: z.number().int().min(0),
    features: z.record(z.boolean()), // Maps tool href to boolean
});

const plansUpdateSchema = z.object({
    plans: z.array(planSchema)
});

// Helper to get default plan configuration from constants
const getDefaultPlans = () => {
    const defaultPlans: any[] = [
        { id: 'lite', name: 'Plan Lite', price: '29€/mes', sites: 1, users: 1, aiCredits: 100, features: {} },
        { id: 'pro', name: 'Plan Pro', price: '49€/mes', sites: 3, users: 3, aiCredits: 500, features: {} },
        { id: 'agency', name: 'Plan Agency', price: '99€/mes', sites: 10, users: 10, aiCredits: 2000, features: {} },
    ];
    
    const allTools = NAV_GROUPS.flatMap(group => 
        group.items.filter(item => item.requiredPlan)
    );

    allTools.forEach(tool => {
        defaultPlans.forEach(plan => {
            if (tool.requiredPlan?.includes(plan.id)) {
                plan.features[tool.href] = true;
            } else if (!plan.features[tool.href]) {
                plan.features[tool.href] = false;
            }
        });
    });
    
    return defaultPlans;
};


async function isUserAuthenticated(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        await adminAuth.verifyIdToken(token);
        return true;
    } catch {
        return false;
    }
}

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
    // ANY authenticated user can fetch the plan configuration to see their tools.
    if (!await isUserAuthenticated(req)) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }
    
    try {
        const docRef = adminDb.collection('config').doc('plans');
        const doc = await docRef.get();

        if (!doc.exists || !doc.data()?.plans) {
            const defaultPlans = getDefaultPlans();
            // If it doesn't exist, we set it for the first time for the super admin.
            // This is a self-healing mechanism.
            await docRef.set({ plans: defaultPlans });
            return NextResponse.json({ plans: defaultPlans });
        }
        
        return NextResponse.json(doc.data());

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


export async function POST(req: NextRequest) {
    // Writing plans is still restricted to super admins
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

    