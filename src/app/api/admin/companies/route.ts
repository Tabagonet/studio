
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';

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

// GET handler to fetch all companies
export async function GET(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const companiesSnapshot = await adminDb.collection('companies').orderBy('name', 'asc').get();
        const usersSnapshot = await adminDb.collection('users').select('companyId').get();

        const userCounts: Record<string, number> = {};
        usersSnapshot.forEach(doc => {
            const companyId = doc.data().companyId;
            if (companyId) {
                userCounts[companyId] = (userCounts[companyId] || 0) + 1;
            }
        });
        
        const companies = companiesSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                createdAt: data.createdAt.toDate().toISOString(),
                userCount: userCounts[doc.id] || 0,
                platform: data.platform || 'woocommerce',
            };
        });

        return NextResponse.json({ companies });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: 'Failed to fetch companies', details: errorMessage }, { status: 500 });
    }
}

// POST handler to create a new company
const createCompanySchema = z.object({
  name: z.string().min(3, "El nombre debe tener al menos 3 caracteres."),
  platform: z.enum(['woocommerce', 'shopify'], { required_error: 'Debes seleccionar una plataforma.' }),
});

export async function POST(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
     if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const validation = createCompanySchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { name, platform } = validation.data;
        const newCompanyRef = adminDb.collection('companies').doc();
        
        await newCompanyRef.set({
            name: name,
            platform: platform,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return NextResponse.json({ success: true, message: 'Empresa creada con éxito.', id: newCompanyRef.id }, { status: 201 });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: 'Failed to create company', details: errorMessage }, { status: 500 });
    }
}
