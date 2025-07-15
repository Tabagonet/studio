
// src/app/api/shopify/jobs/[jobId]/assign/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getPartnerCredentials } from '@/lib/api-helpers';

// Helper to check for admin/super_admin role
async function isAuthorized(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        const role = userDoc.data()?.role;
        return userDoc.exists && ['admin', 'super_admin'].includes(role);
    } catch {
        return false;
    }
}

const assignStoreSchema = z.object({
  storeDomain: z.string().min(1, "El dominio de la tienda es obligatorio.").refine(
    (domain) => domain.includes('.myshopify.com'),
    { message: "El dominio debe ser una URL de .myshopify.com" }
  ),
  shopId: z.string().min(1, "El ID de la tienda es obligatorio."),
});

export async function POST(req: NextRequest, { params }: { params: { jobId: string } }) {
    if (!await isAuthorized(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    const { jobId } = params;
    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
    }

    try {
        const body = await req.json();
        const validation = assignStoreSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid data', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { storeDomain, shopId } = validation.data;
        
        const partnerCreds = await getPartnerCredentials();
        
        const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes,write_navigation,read_navigation,write_files,read_files,write_blogs,read_blogs';
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        
        const installUrl = `https://${storeDomain}/admin/oauth/authorize?client_id=${partnerCreds.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${jobId}`;

        const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
        await jobRef.update({
            storeDomain,
            shopId,
            installUrl,
            status: 'awaiting_auth',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            logs: admin.firestore.FieldValue.arrayUnion({
                timestamp: new Date(),
                message: `Tienda ${storeDomain} asignada. Generando URL de autorización.`,
            }),
        });

        return NextResponse.json({ success: true, message: 'Tienda asignada y lista para autorización.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        if (error instanceof Error && error.message.includes("no están configurados")) {
             return NextResponse.json({ error: { code: 'CONFIGURATION_ERROR', message: errorMessage }}, { status: 409 });
        }
        console.error(`Error assigning store to job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to assign store', details: errorMessage }, { status: 500 });
    }
}
