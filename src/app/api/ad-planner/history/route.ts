
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { CreateAdPlanOutput, Strategy, Task } from '@/app/(app)/ad-planner/schema';

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
            .orderBy('createdAt', 'desc')
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history: CreateAdPlanOutput[] = [];

        for (const doc of snapshot.docs) {
            const data = doc.data();

            // Safely construct the plan object, providing defaults for every possible missing field.
            // This is more robust than relying on Zod's .default() during parsing,
            // as it handles null/undefined fields from the DB directly.
            const plan: CreateAdPlanOutput = {
                id: doc.id,
                createdAt: data.createdAt?.toDate()?.toISOString() || new Date(0).toISOString(),
                url: data.url || '',
                objectives: data.objectives || [],
                executive_summary: data.executive_summary || '',
                target_audience: data.target_audience || '',
                total_monthly_budget: typeof data.total_monthly_budget === 'number' ? data.total_monthly_budget : 0,
                kpis: data.kpis || [],
                calendar: (data.calendar || []).map((c: any) => ({
                    month: c.month || '',
                    focus: c.focus || '',
                    actions: c.actions || [],
                })),
                fee_proposal: {
                    setup_fee: data.fee_proposal?.setup_fee || 0,
                    management_fee: data.fee_proposal?.management_fee || 0,
                    fee_description: data.fee_proposal?.fee_description || '',
                },
                strategies: (data.strategies || []).map((s: any): Strategy => ({
                    platform: s.platform || '',
                    strategy_rationale: s.strategy_rationale || '',
                    funnel_stage: s.funnel_stage || 'Awareness',
                    campaign_type: s.campaign_type || '',
                    ad_formats: s.ad_formats || [],
                    monthly_budget: typeof s.monthly_budget === 'number' ? s.monthly_budget : 0,
                    tasks: (s.tasks || []).map((t: any): Task => ({
                        id: t.id || '', // Note: uuid generation is client-side
                        name: t.name || '',
                        hours: typeof t.hours === 'number' ? t.hours : 0,
                    })),
                })),
            };
            history.push(plan);
        }

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
