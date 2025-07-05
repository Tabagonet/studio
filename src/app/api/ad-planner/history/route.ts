
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
            .limit(50) // Limiting for safety
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history: CreateAdPlanOutput[] = [];

        for (const doc of snapshot.docs) {
            try {
                const data = doc.data();

                // Robust date handling
                let createdAtDate: Date;
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    // Firestore Timestamp
                    createdAtDate = data.createdAt.toDate();
                } else if (typeof data.createdAt === 'string') {
                    // ISO String
                    createdAtDate = new Date(data.createdAt);
                } else {
                    // Fallback
                    createdAtDate = new Date(0);
                }
                
                if (isNaN(createdAtDate.getTime())) {
                    // If parsing still results in an invalid date, use a fallback
                    createdAtDate = new Date(0);
                }

                // Safely construct the plan object, providing defaults for every possible missing field.
                const plan: CreateAdPlanOutput = {
                    id: doc.id,
                    createdAt: createdAtDate.toISOString(),
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
                        setup_fee: typeof data.fee_proposal?.setup_fee === 'number' ? data.fee_proposal.setup_fee : 0,
                        management_fee: typeof data.fee_proposal?.management_fee === 'number' ? data.fee_proposal.management_fee : 0,
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
            } catch (innerError: any) {
                // If a single document fails to process, log it and continue.
                // This prevents one bad record from crashing the entire API endpoint.
                console.error(`Failed to process document ${doc.id}:`, innerError.message);
                // Optionally, you could push a placeholder or just skip it. Skipping is safer.
            }
        }

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
