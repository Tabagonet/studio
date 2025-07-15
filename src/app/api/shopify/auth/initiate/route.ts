// src/app/api/shopify/auth/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';

// This endpoint is now called from a server action and returns the URL as JSON
// instead of performing a redirect itself.

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('No auth token provided');
        if (!adminAuth) throw new Error("Firebase Admin not initialized");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch(e: any) {
         return NextResponse.json({ error: 'Forbidden', details: e.message }, { status: 403 });
    }

    const { jobId } = await req.json();

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

        // Security check: ensure the user initiating is related to the job's entity.
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.data();
        
        let isAuthorized = false;
        if (userData?.role === 'super_admin') {
            isAuthorized = true;
        } else if (jobData.entity.type === 'company' && userData?.companyId === jobData.entity.id) {
            isAuthorized = true;
        } else if (jobData.entity.type === 'user' && uid === jobData.entity.id) {
            isAuthorized = true;
        }

        if (!isAuthorized) {
             return NextResponse.json({ error: 'Forbidden: You are not authorized to perform this action for this job.' }, { status: 403 });
        }

        // Generate the install URL
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId) throw new Error("Client ID de la App Personalizada no configurado.");
        if (!jobData.storeDomain) throw new Error("El dominio de la tienda no está asignado a este trabajo.");

        const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes,write_navigation,read_navigation,write_files,read_files,write_blogs,read_blogs';
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        const installUrl = `https://${jobData.storeDomain}/admin/oauth/authorize?client_id=${partnerCreds.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${jobId}`;
        
        // Update the job with the generated URL, but return it in the response.
        await jobRef.update({ installUrl });

        return NextResponse.json({ installUrl });

    } catch (error: any) {
        console.error(`Error initiating auth for job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to initiate authorization flow', details: error.message }, { status: 500 });
    }
}
