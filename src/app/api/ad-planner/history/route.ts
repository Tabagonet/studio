
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { CreateAdPlanOutput } from '@/app/(app)/ad-planner/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided.');
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }

    try {
        const snapshot = await adminDb.collection('ad_plans')
            .where('userId', '==', uid)
            .get(); 
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history = snapshot.docs.map(doc => {
            try {
                const data = doc.data();
                if (!data || !data.createdAt || typeof data.createdAt.toDate !== 'function') {
                    console.warn(`Skipping malformed ad plan history record (invalid createdAt): ${doc.id}`);
                    return null;
                }
                
                // Handle both old nested structure (data.planData) and new flat structure (data)
                const planData = data.planData || data;

                // Ensure all fields are present to prevent frontend errors
                const finalPlanData = {
                    url: planData.url || '',
                    objectives: planData.objectives || [],
                    executive_summary: planData.executive_summary || '',
                    target_audience: planData.target_audience || '',
                    strategies: planData.strategies || [],
                    total_monthly_budget: planData.total_monthly_budget || 0,
                    calendar: planData.calendar || [],
                    kpis: planData.kpis || [],
                    fee_proposal: planData.fee_proposal || { setup_fee: 0, management_fee: 0, fee_description: '' },
                };

                return {
                    ...finalPlanData,
                    id: doc.id,
                    createdAt: data.createdAt.toDate().toISOString(),
                } as CreateAdPlanOutput;
            } catch (e) {
                 console.error(`Error processing history doc ${doc.id}:`, e);
                 return null;
            }
        }).filter(Boolean as any as (value: any) => value is NonNullable<any>); // Remove nulls from failed records

        history.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
