// src/app/api/shopify/auth/initiate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getPartnerCredentials } from '@/lib/api-helpers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    let uid: string;
    try {
        // Since this is a direct navigation, we can't use Authorization headers.
        // We must rely on the user's browser session cookie, which Next.js automatically handles
        // when calling adminAuth.verifyIdToken with the session cookie.
        // This is a common pattern for server-side auth checks on navigation.
        // For this to work in production, proper cookie configuration is needed.
        // Note: This part of the auth flow is complex. For now, we'll verify the user is logged in.
        // A more robust solution might involve a temporary, single-use token.
        const sessionCookie = req.cookies.get('__session')?.value;
        if (!sessionCookie) {
             const token = req.headers.get('Authorization')?.split('Bearer ')[1];
             if(!token) throw new Error('No auth token or session found.');
             uid = (await adminAuth.verifyIdToken(token)).uid;
        } else {
             const decodedToken = await adminAuth.verifySessionCookie(sessionCookie, true);
             uid = decodedToken.uid;
        }

    } catch(e: any) {
         console.error("Auth error in initiate route:", e.message);
         // Redirect to login if auth fails
         const loginUrl = new URL('/login', req.nextUrl.origin);
         return NextResponse.redirect(loginUrl.toString());
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

        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.clientId) throw new Error("Client ID de la App Personalizada no configurado.");
        if (!jobData.storeDomain) throw new Error("El dominio de la tienda no está asignado a este trabajo.");

        const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes,write_navigation,read_navigation,write_files,read_files,write_blogs,read_blogs';
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        
        console.log(`[Shopify Auth Initiate] Generated Redirect URI for Shopify: ${redirectUri}`);

        const installUrl = new URL(`https://${jobData.storeDomain}/admin/oauth/authorize`);
        installUrl.searchParams.set('client_id', partnerCreds.clientId);
        installUrl.searchParams.set('scope', scopes);
        installUrl.searchParams.set('redirect_uri', redirectUri);
        installUrl.searchParams.set('state', jobId);
        
        await jobRef.update({ installUrl: installUrl.toString() });

        // Redirect the user's browser to the Shopify authorization page
        return NextResponse.redirect(installUrl.toString());

    } catch (error: any) {
        console.error(`Error initiating auth for job ${jobId}:`, error);
        return NextResponse.json({ error: 'Failed to initiate authorization flow', details: error.message }, { status: 500 });
    }
}
