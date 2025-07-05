
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres."),
  taxId: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Formato de email inválido.").optional().nullable(),
  logoUrl: z.string().url("Formato de URL inválido.").optional().nullable(),
});

export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }
    try {
        await getUserContext(req); // Just for auth check
        const { searchParams } = new URL(req.url);
        const targetCompanyIdFromUrl = searchParams.get('companyId');

        if (!targetCompanyIdFromUrl) {
            return NextResponse.json({ error: 'Company ID is required.' }, { status: 400 });
        }

        const settingsRef = adminDb.collection('companies').doc(targetCompanyIdFromUrl);
        const docSnap = await settingsRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ company: null }, { status: 200 }); // Return null if not found
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
        const { role, companyId: userCompanyId } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
            companyId: z.string().optional(), // For super_admin editing a specific company
            data: companyUpdateSchema,
        });

        const validation = payloadSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { companyId: targetCompanyId, data } = validation.data;

        let effectiveCompanyId: string | null = null;

        if (role === 'super_admin') {
            effectiveCompanyId = targetCompanyId || null;
             if (!effectiveCompanyId) {
                return NextResponse.json({ error: 'Super Admins must specify a target companyId in the payload.' }, { status: 400 });
            }
        } else if (role === 'admin') {
            effectiveCompanyId = userCompanyId;
        }

        if (!effectiveCompanyId) {
             return NextResponse.json({ error: 'Forbidden. No permissions to save company data.' }, { status: 403 });
        }
        
        const settingsRef = adminDb.collection('companies').doc(effectiveCompanyId);
        
        const { name, ...restOfData } = data;
        const updatePayload: any = restOfData;

        // Only super_admin can change the company name
        if (role === 'super_admin') {
            updatePayload.name = name;
        }
        
        await settingsRef.set(updatePayload, { merge: true });

        return NextResponse.json({ success: true, message: 'Company data saved successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error saving company data:', error);
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
