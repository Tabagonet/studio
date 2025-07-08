// src/app/api/user-settings/connections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { addRemotePattern } from '@/lib/next-config-manager';

export const dynamic = 'force-dynamic';

async function getUserContext(req: NextRequest): Promise<{ uid: string; role: string | null; companyId: string | null }> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized.");
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

const shopifyUrlOrEmptyString = z.string().refine((value) => {
    if (value === '') return true;
    // Shopify URLs must be in the format `something.myshopify.com`
    return /^[a-zA-Z0-9-]+\.myshopify\.com$/.test(value);
}, { message: "Invalid Shopify URL format. Must be like 'your-store.myshopify.com'." });


const connectionDataSchema = z.object({
    wooCommerceStoreUrl: urlOrEmptyString.optional(),
    wooCommerceApiKey: z.string().optional(),
    wooCommerceApiSecret: z.string().optional(),
    wordpressApiUrl: urlOrEmptyString.optional(),
    wordpressUsername: z.string().optional(),
    wordpressApplicationPassword: z.string().optional(),
    shopifyStoreUrl: shopifyUrlOrEmptyString.optional(),
    shopifyApiPassword: z.string().optional(),
    partnerClientId: z.string().optional(),
    partnerClientSecret: z.string().optional(),
    promptTemplate: z.string().optional(),
});

export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const targetCompanyId = req.nextUrl.searchParams.get('companyId');
        const targetUserId = req.nextUrl.searchParams.get('userId');
        let settingsDoc;
        
        let targetRef;
        if (role === 'super_admin') {
            if (targetCompanyId) {
                targetRef = adminDb.collection('companies').doc(targetCompanyId);
            } else {
                targetRef = adminDb.collection('user_settings').doc(targetUserId || uid);
            }
        } else { // 'admin' or regular user
             if (userCompanyId) {
                 targetRef = adminDb.collection('companies').doc(userCompanyId);
            } else {
                 targetRef = adminDb.collection('user_settings').doc(uid);
            }
        }
        
        settingsDoc = await targetRef.get();

        if (settingsDoc && settingsDoc.exists) {
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
            companyId: z.string().optional(),
            userId: z.string().optional(),
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, connectionData, setActive, companyId: targetCompanyId, userId: targetUserId } = validationResult.data;

        let settingsRef;
        let isUpdate = false;
        
        if (role === 'super_admin') {
            if (targetCompanyId) {
                settingsRef = adminDb.collection('companies').doc(targetCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(targetUserId || uid);
            }
        } else { // 'admin' or regular user
            if (userCompanyId) {
                settingsRef = adminDb.collection('companies').doc(userCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(uid);
            }
        }
        
        const settingsSnap = await settingsRef.get();
        if (settingsSnap.exists) {
            const settingsData = settingsSnap.data();
            const currentConnections = settingsData?.connections || {};
            isUpdate = Object.prototype.hasOwnProperty.call(currentConnections, key);
        }
        
        const isEditingOwnSettings = !targetCompanyId && (!targetUserId || targetUserId === uid);
        if (isEditingOwnSettings) {
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
        
        const { wooCommerceStoreUrl, wordpressApiUrl, shopifyStoreUrl } = connectionData;
        const hostnamesToAdd = new Set<string>();

        const addHostname = (url: string | undefined) => {
             if (url) {
                try {
                    const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                    hostnamesToAdd.add(new URL(fullUrl).hostname);
                } catch (e) {
                    console.warn(`Invalid URL provided, skipping remote pattern: ${url}`);
                }
            }
        };

        addHostname(wooCommerceStoreUrl);
        addHostname(wordpressApiUrl);
        addHostname(shopifyStoreUrl);


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
             companyId: z.string().optional(),
             userId: z.string().optional(),
        });
        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, companyId: targetCompanyId, userId: targetUserId } = validationResult.data;

        let settingsRef;
        if (role === 'super_admin') {
            if (targetCompanyId) {
                settingsRef = adminDb.collection('companies').doc(targetCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(targetUserId || uid);
            }
        } else { // 'admin' or 'user'
            if (userCompanyId) {
                settingsRef = adminDb.collection('companies').doc(userCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(uid);
            }
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
