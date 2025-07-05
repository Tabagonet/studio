
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { addRemotePattern } from '@/lib/next-config-manager';

export const dynamic = 'force-dynamic';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    if (!adminDb) throw new Error('Firestore not configured on server.');
    const userDoc = await adminDb.collection('users').doc(uid).get();

    if (!userDoc.exists) throw new Error("User record not found in database.");
    const userData = userDoc.data();

    return {
        uid: uid,
        role: userData?.role || null,
        companyId: userData?.companyId || null,
    };
}

const urlOrEmptyString = z.string().refine((value) => {
    if (value === '') return true;
    try {
        const urlToTest = value.startsWith('http') ? value : `https://${value}`;
        new URL(urlToTest);
        return true;
    } catch { return false; }
}, { message: "Invalid URL format. Must be a valid URL or empty." });

const connectionDataSchema = z.object({
    wooCommerceStoreUrl: urlOrEmptyString.optional(),
    wooCommerceApiKey: z.string().optional(),
    wooCommerceApiSecret: z.string().optional(),
    wordpressApiUrl: urlOrEmptyString.optional(),
    wordpressUsername: z.string().optional(),
    wordpressApplicationPassword: z.string().optional(),
    promptTemplate: z.string().optional(),
});

export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { uid, role } = await getUserContext(req);
        const targetCompanyId = req.nextUrl.searchParams.get('companyId');
        let settingsDoc;
        
        if (role === 'super_admin' && targetCompanyId) {
             settingsDoc = await adminDb.collection('companies').doc(targetCompanyId).get();
        } else {
            // Regular admins or super admins fetching their own data will get their settings
            const userDoc = await adminDb.collection('users').doc(uid).get();
            const companyId = userDoc.data()?.companyId;

            if (role === 'admin' && companyId) {
                 settingsDoc = await adminDb.collection('companies').doc(companyId).get();
            } else {
                 settingsDoc = await adminDb.collection('user_settings').doc(uid).get();
            }
        }

        if (settingsDoc.exists) {
            const data = settingsDoc.data();
            return NextResponse.json({
                allConnections: data?.connections || {},
                activeConnectionKey: data?.activeConnectionKey || null,
            });
        }
        return NextResponse.json({ allConnections: {}, activeConnectionKey: null });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error fetching connections:', error);
        return NextResponse.json({ error: errorMessage || 'Authentication required' }, { status: 401 });
    }
}

export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }
    
    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
            key: z.string().min(1, "Key is required"),
            connectionData: connectionDataSchema,
            setActive: z.boolean().optional().default(false),
            companyId: z.string().optional(), // For super_admin editing a specific company
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, connectionData, setActive, companyId: targetCompanyId } = validationResult.data;

        let settingsRef;
        let isUpdate = false;

        if (role === 'super_admin' && targetCompanyId) {
            settingsRef = adminDb.collection('companies').doc(targetCompanyId);
        } else if (role === 'admin' && userCompanyId) {
            settingsRef = adminDb.collection('companies').doc(userCompanyId);
        } else if (role === 'super_admin') {
            settingsRef = adminDb.collection('user_settings').doc(uid);
        } else {
             return NextResponse.json({ error: 'Forbidden. No permissions to save connections.' }, { status: 403 });
        }
        
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
            const settingsData = settingsSnap.data();
            const currentConnections = settingsData?.connections || {};
            isUpdate = Object.prototype.hasOwnProperty.call(currentConnections, key);
        }
        
        // Site limit check for non-super admins creating a new connection
        if (role !== 'super_admin') {
            const userDoc = await adminDb.collection('users').doc(uid).get();
            const siteLimit = userDoc.data()?.siteLimit ?? 1;
            const connectionCount = settingsSnap.exists ? Object.keys(settingsSnap.data()?.connections || {}).length : 0;
            if (!isUpdate && connectionCount >= siteLimit) {
                 return NextResponse.json({ error: `Límite de sitios alcanzado. Tu plan permite ${siteLimit} sitio(s).` }, { status: 403 });
            }
        }
        
        await settingsRef.set({
            connections: { [key]: connectionData },
            ...(setActive && { activeConnectionKey: key })
        }, { merge: true });
        
        const { wooCommerceStoreUrl, wordpressApiUrl } = connectionData;
        const hostnamesToAdd = new Set<string>();

        if (wooCommerceStoreUrl) {
            try {
                const fullUrl = wooCommerceStoreUrl.startsWith('http') ? wooCommerceStoreUrl : `https://${wooCommerceStoreUrl}`;
                hostnamesToAdd.add(new URL(fullUrl).hostname);
            } catch (e) { console.warn(`Invalid WooCommerce URL: ${wooCommerceStoreUrl}`); }
        }
        if (wordpressApiUrl) {
            try {
                const fullUrl = wordpressApiUrl.startsWith('http') ? wordpressApiUrl : `https://${wordpressApiUrl}`;
                hostnamesToAdd.add(new URL(fullUrl).hostname);
            } catch (e) { console.warn(`Invalid WordPress URL: ${wordpressApiUrl}`); }
        }

        if (hostnamesToAdd.size > 0) {
            const promises = Array.from(hostnamesToAdd).map(hostname => addRemotePattern(hostname).catch(err => console.error(`Failed to add remote pattern for ${hostname}:`, err)));
            Promise.all(promises).catch(err => console.error("Error batch updating remote patterns:", err));
        }

        return NextResponse.json({ success: true, message: 'Connection saved successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error saving user connections:', error);
        return NextResponse.json({ error: errorMessage || 'Failed to save connections' }, { status: 500 });
    }
}


export async function DELETE(req: NextRequest) {
    if (!adminDb || !admin.firestore.FieldValue) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
             key: z.string().min(1, "Key is required"),
             companyId: z.string().optional(), // For super_admin
        });
        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, companyId: targetCompanyId } = validationResult.data;

        let settingsRef;
        if (role === 'super_admin' && targetCompanyId) {
            settingsRef = adminDb.collection('companies').doc(targetCompanyId);
        } else if (role === 'admin' && userCompanyId) {
            settingsRef = adminDb.collection('companies').doc(userCompanyId);
        } else if (role === 'super_admin') {
            settingsRef = adminDb.collection('user_settings').doc(uid);
        } else {
             return NextResponse.json({ error: 'Forbidden. No permissions to delete connections.' }, { status: 403 });
        }
        
        const doc = await settingsRef.get();
        const currentData = doc.data();
        if (!doc.exists || !currentData?.connections?.[key]) {
             return NextResponse.json({ success: true, message: 'Connection already deleted.' });
        }

        const updatePayload: { [key: string]: any } = {
            [`connections.${key}`]: admin.firestore.FieldValue.delete()
        };

        if (currentData?.activeConnectionKey === key) {
            const otherKeys = Object.keys(currentData.connections || {}).filter(k => k !== key);
            updatePayload.activeConnectionKey = otherKeys.length > 0 ? otherKeys[0] : null;
        }

        await settingsRef.update(updatePayload);

        return NextResponse.json({ success: true, message: 'Connection deleted successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error deleting user connection:', error);
        return NextResponse.json({ error: errorMessage || 'Failed to delete connection' }, { status: 500 });
    }
}
