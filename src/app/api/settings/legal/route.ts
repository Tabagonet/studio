
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

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

const legalTextsSchema = z.object({
  privacyPolicy: z.string(),
  termsOfService: z.string(),
});

const defaultTexts = {
    privacyPolicy: `<h1>Política de Privacidad</h1>\n<p>Por favor, añade aquí tu política de privacidad. Puedes usar HTML para darle formato.</p>`,
    termsOfService: `<h1>Términos de Servicio</h1>\n<p>Por favor, añade aquí tus términos y condiciones. Puedes usar HTML para darle formato.</p>`
};

export async function GET(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado.' }, { status: 503 });
    }

    try {
        const docRef = adminDb.collection('config').doc('legal');
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json(defaultTexts);
        }
        
        const data = doc.data();
        return NextResponse.json({
            privacyPolicy: data?.privacyPolicy || defaultTexts.privacyPolicy,
            termsOfService: data?.termsOfService || defaultTexts.termsOfService,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}


export async function POST(req: NextRequest) {
    if (!await isSuperAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore no configurado.' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const validation = legalTextsSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const docRef = adminDb.collection('config').doc('legal');
        await docRef.set(validation.data, { merge: true });
        
        return NextResponse.json({ success: true, message: "Textos legales actualizados." });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
