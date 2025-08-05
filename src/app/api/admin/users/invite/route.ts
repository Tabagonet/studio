
// src/app/api/admin/users/invite/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import type { PlanUsage } from '@/lib/types';

const inviteSchema = z.object({
  email: z.string().email("El formato del email no es válido."),
});

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User record not found in database.");
    const userData = userDoc.data();

    return {
        uid: uid,
        role: userData?.role || null,
        companyId: userData?.companyId || null,
    };
}


export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const adminContext = await getUserContext(req);
        const isAuthorized = adminContext.role === 'admin' || adminContext.role === 'super_admin';

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        
        if (adminContext.role === 'admin' && !adminContext.companyId) {
             return NextResponse.json({ error: 'Admins must belong to a company to invite users.' }, { status: 403 });
        }

        const body = await req.json();
        const validation = inviteSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { email } = validation.data;
        const companyIdToAssign = adminContext.companyId;

        // --- Check Plan Limits (for non-super-admins) ---
        if (adminContext.role !== 'super_admin') {
             if (!companyIdToAssign) {
                return NextResponse.json({ error: 'No tienes una empresa asignada para invitar usuarios.' }, { status: 400 });
            }
            
            const companyDoc = await adminDb.collection('companies').doc(companyIdToAssign).get();
            const plansDoc = await adminDb.collection('config').doc('plans').get();
            if (!companyDoc.exists || !plansDoc.exists) {
                return NextResponse.json({ error: 'No se pudo verificar la información del plan.' }, { status: 500 });
            }
            const companyData = companyDoc.data()!;
            const allPlans = plansDoc.data()!.plans;
            const currentPlan = allPlans.find((p: any) => p.id === companyData.plan) || allPlans.find((p: any) => p.id === 'lite');
            
            const usersSnapshot = await adminDb.collection('users').where('companyId', '==', companyIdToAssign).get();
            
            if (usersSnapshot.size >= currentPlan.users) {
                 return NextResponse.json({ error: 'Límite de usuarios alcanzado para tu plan. Mejora tu plan para añadir más usuarios.' }, { status: 402 });
            }
        }
        
        // --- Check if user or invitation already exists ---
        const lowercasedEmail = email.toLowerCase();
        const usersQuery = await adminDb.collection('users').where('email', '==', lowercasedEmail).limit(1).get();
        if (!usersQuery.empty) {
            return NextResponse.json({ error: `Un usuario con el email ${email} ya existe en la plataforma.` }, { status: 409 });
        }
        
        const invitationsQuery = await adminDb.collection('invitations').where('email', '==', lowercasedEmail).limit(1).get();
        if (!invitationsQuery.empty) {
            return NextResponse.json({ error: `Ya existe una invitación pendiente para el email ${email}.` }, { status: 409 });
        }

        // --- Create Invitation ---
        const invitationRef = adminDb.collection('invitations').doc();
        await invitationRef.set({
            email: lowercasedEmail,
            companyId: companyIdToAssign,
            invitedBy: adminContext.uid,
            createdAt: new Date(),
        });

        return NextResponse.json({ success: true, message: `Se ha enviado una invitación a ${email}. El usuario podrá registrarse y se unirá automáticamente a tu empresa.` });

    } catch (error: any) {
        console.error('Error sending invitation:', error);
        return NextResponse.json({ error: 'Failed to send invitation', details: error.message }, { status: 500 });
    }
}
