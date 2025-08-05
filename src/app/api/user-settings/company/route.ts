

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

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

const companyUpdateSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres.").optional(),
  platform: z.enum(['woocommerce', 'shopify']).optional(),
  plan: z.enum(['lite', 'pro', 'agency']).optional().nullable(),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Formato de email inválido.").or(z.literal('')).optional().nullable(),
  logoUrl: z.string().url("Formato de URL inválido.").optional().nullable(),
  seoHourlyRate: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : parseFloat(String(val))),
    z.number().positive("El precio debe ser un número positivo.").optional().nullable()
  ),
  shopifyCreationDefaults: z.object({
      createProducts: z.boolean(),
      theme: z.string().optional(),
  }).optional(),
});

export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }
    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const { searchParams } = new URL(req.url);
        const targetCompanyId = searchParams.get('companyId');

        if (!targetCompanyId) {
            return NextResponse.json({ error: 'Company ID is required.' }, { status: 400 });
        }
        
        // Authorization Check
        const isSuperAdmin = role === 'super_admin';
        const isAdminOfTargetCompany = role === 'admin' && userCompanyId === targetCompanyId;

        if (!isSuperAdmin && !isAdminOfTargetCompany) {
             return NextResponse.json({ error: 'Forbidden. You do not have permission to view this company.' }, { status: 403 });
        }
        
        const settingsRef = adminDb.collection('companies').doc(targetCompanyId);
        const docSnap = await settingsRef.get();

        if (!docSnap.exists) {
            // It might be in user_settings as a fallback
            const userSettingsRef = adminDb.collection('user_settings').doc(targetCompanyId);
            const userSettingsDoc = await userSettingsRef.get();
             if (!userSettingsDoc.exists) {
                return NextResponse.json({ company: null }, { status: 404 });
            }
            return NextResponse.json({ company: userSettingsDoc.data() });
        }
        return NextResponse.json({ company: docSnap.data() });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }
    try {
        const { uid, role } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
            companyId: z.string().optional(),
            userId: z.string().optional(),
            data: companyUpdateSchema,
        });

        const validation = payloadSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { companyId: targetCompanyId, userId: targetUserId, data } = validation.data;

        let settingsRef;
        let entityType: 'user' | 'company' | null = null;
        let effectiveId: string | null = null;
        
        // Super admin can edit any specified company or user.
        if (role === 'super_admin') {
            if (targetCompanyId) {
                entityType = 'company';
                effectiveId = targetCompanyId;
            } else if (targetUserId) {
                entityType = 'user';
                effectiveId = targetUserId;
            } else {
                 return NextResponse.json({ error: 'No target entity ID provided for super_admin.' }, { status: 400 });
            }
        } 
        // A regular admin can only edit their own company settings.
        else if (role === 'admin') {
            const userDoc = (await adminDb.collection('users').doc(uid).get()).data();
            if (userDoc?.companyId) {
                entityType = 'company';
                effectiveId = userDoc.companyId;
            } else {
                // An admin without a company can edit their own user_settings.
                entityType = 'user';
                effectiveId = uid;
            }
        }
        
        if (!effectiveId || !entityType) {
             return NextResponse.json({ error: 'Forbidden. No permissions to save data for the target entity.' }, { status: 403 });
        }
        
        settingsRef = adminDb.collection(entityType === 'company' ? 'companies' : 'user_settings').doc(effectiveId);
        
        const { name, platform, plan, ...restOfData } = data;
        
        let updatePayload: any = { ...restOfData };
        
        if (role === 'super_admin' && entityType === 'company') {
            if (name !== undefined) updatePayload.name = name;
            if (platform !== undefined) updatePayload.platform = platform;
            if (plan !== undefined) updatePayload.plan = plan;
        } else {
            // Regular admins cannot change the name, platform, or plan of a company.
            // These fields will be ignored if sent.
        }
        
        await settingsRef.set(updatePayload, { merge: true });

        return NextResponse.json({ success: true, message: 'Data saved successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error saving settings data:', error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
