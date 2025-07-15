
// src/app/api/shopify/auth/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';

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

export async function GET(req: NextRequest) {
    if (!await isAuthorized(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
        return NextResponse.json({ error: 'Job ID is required.' }, { status: 400 });
    }

    try {
        if (!adminDb) throw new Error("Firestore not configured");
        const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
        const jobDoc = await jobRef.get();

        if (!jobDoc.exists) {
            return NextResponse.json({ error: `Job with ID ${jobId} not found.` }, { status: 404 });
        }
        const jobData = jobDoc.data()!;

        if (!jobData.installUrl) {
            // This part is a fallback, but the URL should ideally be generated during assignment.
            console.log(`Install URL not found for job ${jobId}, generating it now...`);
            const partnerCreds = await getPartnerCredentials();
            if (!partnerCreds.clientId) throw new Error("Client ID de la App Personalizada no configurado.");
            if (!jobData.storeDomain) throw new Error("El dominio de la tienda no está asignado a este trabajo.");

            const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes,write_navigation,read_navigation,write_files,read_files,write_blogs,read_blogs';
            const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
            const installUrl = `https://${jobData.storeDomain}/admin/oauth/authorize?client_id=${partnerCreds.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${jobId}`;
            
            await jobRef.update({ installUrl });
            return NextResponse.redirect(installUrl);
        }

        // Redirect the user to the pre-generated install URL
        return NextResponse.redirect(jobData.installUrl);

    } catch (error: any) {
        console.error(`Error initiating auth for job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to initiate authorization flow', details: error.message }, { status: 500 });
    }
}
