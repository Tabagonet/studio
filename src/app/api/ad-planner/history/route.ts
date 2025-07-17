
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import type { CreateAdPlanOutput, Strategy, Task, GenerateAdCreativesOutput } from '@/app/(app)/ad-planner/schema';

export const dynamic = 'force-dynamic';

const FunnelStageSchemaForHistory = {
    stage_name: '',
    description: '',
    channels: [],
    content_types: [],
    kpis: [],
};

const StrategySchemaForHistory = {
    platform: '',
    strategy_rationale: '',
    funnel_stage: 'Consideration' as const,
    campaign_type: '',
    ad_formats: [],
    monthly_budget: 0,
    targeting_suggestions: [],
    key_kpis: [],
    creative_angle: '',
    tasks: [],
    creatives: undefined,
};

const FeeProposalSchemaForHistory = {
    setup_fee: 0,
    management_fee: 0,
    fee_description: '',
};

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
        if (!adminDb) throw new Error("Firestore not configured on server."); // Added check
        const snapshot = await adminDb.collection('ad_plans')
            .where('userId', '==', uid)
            .limit(50) 
            .get();
        
        if (snapshot.empty) {
            return NextResponse.json({ history: [] });
        }

        const history: CreateAdPlanOutput[] = [];

        for (const doc of snapshot.docs) {
            try {
                const data = doc.data();

                let createdAtDate: Date;
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    createdAtDate = data.createdAt.toDate();
                } else if (typeof data.createdAt === 'string') {
                    createdAtDate = new Date(data.createdAt);
                } else {
                    createdAtDate = new Date(0);
                }
                
                if (isNaN(createdAtDate.getTime())) {
                    createdAtDate = new Date(0);
                }
                
                const plan: CreateAdPlanOutput = {
                    id: doc.id,
                    createdAt: createdAtDate.toISOString(),
                    // --- User Input Fields ---
                    url: data.url || '',
                    objectives: data.objectives || [],
                    companyInfo: data.companyInfo || '',
                    valueProposition: data.valueProposition || '',
                    targetAudience: data.targetAudience || '',
                    competitors: data.competitors || '',
                    priorityObjective: data.priorityObjective || '',
                    brandPersonality: data.brandPersonality || [],
                    monthlyBudget: data.monthlyBudget || '',
                    additionalContext: data.additionalContext || '',

                    // --- AI Generated Fields ---
                    buyer_persona: data.buyer_persona || '',
                    value_proposition: data.value_proposition || '',
                    funnel: (data.funnel || []).map((f: any) => ({
                        ...FunnelStageSchemaForHistory,
                        ...f,
                    })),
                    strategies: (data.strategies || []).map((s: any): Strategy => ({
                        ...StrategySchemaForHistory,
                        ...s,
                        monthly_budget: typeof s.monthly_budget === 'number' ? s.monthly_budget : 0,
                        tasks: (s.tasks || []).map((t: any): Task => ({
                            id: t.id || '',
                            name: t.name || '',
                            hours: typeof t.hours === 'number' ? t.hours : 0,
                        })),
                        creatives: s.creatives ? {
                            headlines: s.creatives.headlines || [],
                            descriptions: s.creatives.descriptions || [],
                            cta_suggestions: s.creatives.cta_suggestions || [],
                            visual_ideas: s.creatives.visual_ideas || [],
                        } : undefined,
                    })),
                    total_monthly_budget: typeof data.total_monthly_budget === 'number' ? data.total_monthly_budget : 0,
                    recommended_tools: data.recommended_tools || [],
                    calendar: (data.calendar || []).map((c: any) => ({
                        month: c.month || '',
                        focus: c.focus || '',
                        actions: c.actions || [],
                    })),
                    extra_recommendations: data.extra_recommendations || [],
                    fee_proposal: {
                        ...FeeProposalSchemaForHistory,
                        ...(data.fee_proposal || {}),
                        setup_fee: typeof data.fee_proposal?.setup_fee === 'number' ? data.fee_proposal.setup_fee : 0,
                        management_fee: typeof data.fee_proposal?.management_fee === 'number' ? data.fee_proposal.management_fee : 0,
                    },
                };
                history.push(plan);
            } catch (innerError: any) {
                console.error(`Failed to process document ${doc.id}:`, innerError.message);
            }
        }
        
        history.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

        return NextResponse.json({ history });

    } catch (error: any) {
        console.error("Error fetching ad plan history:", error);
        return NextResponse.json({ error: 'Failed to fetch history', details: error.message }, { status: 500 });
    }
}
