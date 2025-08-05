
      
// src/app/api/user-settings/my-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { Company, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null; plan: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User record not found in database.");
    const userData = userDoc.data()!;

    return {
        uid: uid,
        role: userData.role || null,
        companyId: userData.companyId || null,
        plan: userData.plan || null, // individual plan
    };
}


export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const userContext = await getUserContext(req);

        // Fetch all plan configurations
        const plansDoc = await adminDb.collection('config').doc('plans').get();
        if (!plansDoc.exists) throw new Error('Plan configurations not found.');
        const allPlans = plansDoc.data()!.plans;
        
        let currentPlan: any = null;
        let usage = {
            connections: { used: 0, limit: 0 },
            users: { used: 0, limit: 0 },
            aiCredits: { 
              used: 0, 
              limit: 0,
              oneTimeAvailable: 0,
              totalAvailable: 0,
            },
        };
        
        // Super admin might be checking a specific company's plan
        const targetCompanyId = req.nextUrl.searchParams.get('companyId');
        const effectiveCompanyId = userContext.role === 'super_admin' && targetCompanyId ? targetCompanyId : userContext.companyId;

        if (effectiveCompanyId) {
            // User belongs to a company, get company plan and usage
            const companyDoc = await adminDb.collection('companies').doc(effectiveCompanyId).get();
            if (companyDoc.exists) {
                const companyData = companyDoc.data()!;
                const planId = companyData.plan || 'lite';
                currentPlan = allPlans.find((p: any) => p.id === planId);
                
                const companySettingsDoc = await adminDb.collection('companies').doc(effectiveCompanyId).get();
                const connections = companySettingsDoc.data()?.connections || {};
                usage.connections.used = Object.keys(connections).filter(k => k !== 'partner_app').length;
                usage.connections.limit = currentPlan?.sites ?? 0;
                
                const usersSnapshot = await adminDb.collection('users').where('companyId', '==', effectiveCompanyId).get();
                usage.users.used = usersSnapshot.size;
                usage.users.limit = currentPlan?.users ?? 0;
                
                usage.aiCredits.used = companyData.aiUsageCount || 0;
                usage.aiCredits.limit = currentPlan?.aiCredits ?? 0;
                usage.aiCredits.oneTimeAvailable = (companyData.oneTimeCredits || []).reduce((sum: number, credit: any) => sum + credit.amount, 0);
                usage.aiCredits.totalAvailable = usage.aiCredits.limit + usage.aiCredits.oneTimeAvailable;

            }
        } else {
            // User is individual (or admin without company)
            const planId = userContext.plan || 'lite';
            currentPlan = allPlans.find((p: any) => p.id === planId);
            
            const userSettingsDoc = await adminDb.collection('user_settings').doc(userContext.uid).get();
            if (userSettingsDoc.exists) {
                const userSettings = userSettingsDoc.data()!;
                const connections = userSettings.connections || {};
                usage.connections.used = Object.keys(connections).filter(k => k !== 'partner_app').length;
                usage.aiCredits.used = userSettings.aiUsageCount || 0;
                usage.aiCredits.oneTimeAvailable = (userSettings.oneTimeCredits || []).reduce((sum: number, credit: any) => sum + credit.amount, 0);
            }
            usage.connections.limit = currentPlan?.sites ?? 0;
            usage.users.used = 1; // An individual user is 1 user
            usage.users.limit = currentPlan?.users ?? 0;
            usage.aiCredits.limit = currentPlan?.aiCredits ?? 0;
            usage.aiCredits.totalAvailable = usage.aiCredits.limit + usage.aiCredits.oneTimeAvailable;
        }

        if (!currentPlan) {
            return NextResponse.json({ error: 'No active plan found for this user or company.' }, { status: 404 });
        }

        return NextResponse.json({
            currentPlan,
            allPlans,
            usage
        });

    } catch (error: any) {
        console.error('Error fetching plan data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
