
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import type { Prospect } from '@/lib/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

async function getAdminContext(req: NextRequest): Promise<{ uid: string | null; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return { uid: null, role: null, companyId: null };
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists) {
            return { uid: decodedToken.uid, role: null, companyId: null };
        }
        const data = userDoc.data()!;
        return {
            uid: decodedToken.uid,
            role: data.role || null,
            companyId: data.companyId || null,
        };
    } catch {
        return { uid: null, role: null, companyId: null };
    }
}


export async function GET(req: NextRequest) {
    const adminContext = await getAdminContext(req);
    const isAuthorized = adminContext.role === 'admin' || adminContext.role === 'super_admin';
    
    if (!isAuthorized) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        let query: FirebaseFirestore.Query = adminDb.collection('prospects');
        
        // In a future multi-tenant setup, an admin would only see their company's prospects
        // if (adminContext.role === 'admin' && adminContext.companyId) {
        //     query = query.where('assignedToCompanyId', '==', adminContext.companyId);
        // }
        
        const snapshot = await query.orderBy('createdAt', 'desc').get();
        
        const prospects: Prospect[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                email: data.email,
                companyUrl: data.companyUrl,
                status: data.status,
                createdAt: data.createdAt.toDate().toISOString(),
                source: data.source,
                inquiryData: data.inquiryData || {},
            }
        });

        return NextResponse.json({ prospects });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching prospects:", error);
        return NextResponse.json({ error: 'Failed to fetch prospects', details: errorMessage }, { status: 500 });
    }
}

const createProspectSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email format'),
  companyUrl: z.string().url('Invalid URL format'),
  inquiryData: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
    // This endpoint can be called publicly by the chatbot, so no admin check needed
     if (!adminDb || !admin.firestore.FieldValue) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }
    try {
        const body = await req.json();
        const validation = createProspectSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { name, email, companyUrl, inquiryData } = validation.data;

        const newProspectRef = adminDb.collection('prospects').doc();
        await newProspectRef.set({
            name,
            email,
            companyUrl,
            inquiryData: inquiryData || {},
            status: 'new',
            source: 'chatbot',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Notify admins about the new prospect
        const adminsSnapshot = await adminDb.collection('users').where('role', 'in', ['admin', 'super_admin']).get();
        if (!adminsSnapshot.empty) {
            const notificationBatch = adminDb.batch();
            for (const adminDoc of adminsSnapshot.docs) {
                const notificationRef = adminDb.collection('notifications').doc();
                notificationBatch.set(notificationRef, {
                    recipientUid: adminDoc.id, type: 'new_prospect', title: 'Nuevo Prospecto Capturado',
                    message: `El prospecto ${name} (${companyUrl}) ha completado el cuestionario.`,
                    link: '/prospects', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            }
            await notificationBatch.commit();
        }

        return NextResponse.json({ success: true, message: 'Prospect created successfully.' }, { status: 201 });
    } catch (error: any) {
        console.error("Error creating prospect:", error);
        return NextResponse.json({ error: 'Failed to create prospect', details: error.message }, { status: 500 });
    }
}
