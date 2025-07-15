
// src/app/api/user-settings/connections/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { addRemotePattern } from '@/lib/next-config-manager';
import { partnerAppConnectionDataSchema } from '@/lib/api-helpers';

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
});
type ConnectionData = z.infer<typeof connectionDataSchema>;
type PartnerAppData = z.infer<typeof partnerAppConnectionDataSchema>;
type AllConnections = { [key: string]: ConnectionData | PartnerAppData };


export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const targetCompanyId = req.nextUrl.searchParams.get('companyId');
        const targetUserId = req.nextUrl.searchParams.get('userId');
        
        let settingsRef: FirebaseFirestore.DocumentReference;
        let entityConnections = {};
        
        if (role === 'super_admin') {
            const effectiveId = targetCompanyId || targetUserId || uid;
            const collection = targetCompanyId ? 'companies' : 'user_settings';
            settingsRef = adminDb.collection(collection).doc(effectiveId);
        } else {
            const collection = userCompanyId ? 'companies' : 'user_settings';
            const effectiveId = userCompanyId || uid;
            settingsRef = adminDb.collection(collection).doc(effectiveId);
        }
        
        const settingsDoc = await settingsRef.get();
        if (settingsDoc.exists) {
            entityConnections = settingsDoc.data()?.connections || {};
        }

        const globalSettingsDoc = await adminDb.collection('companies').doc('global_settings').get();
        const partnerAppData = globalSettingsDoc.exists ? globalSettingsDoc.data()?.connections?.partner_app || null : null;
        
        const allConnections: AllConnections = { ...entityConnections };
        if (partnerAppData) {
            allConnections.partner_app = partnerAppData;
        }

        return NextResponse.json({
            allConnections: allConnections,
            activeConnectionKey: settingsDoc.exists ? settingsDoc.data()?.activeConnectionKey || null : null,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: errorMessage || 'Authentication required' }, { status: 401 });
    }
}

export async function POST(req: NextRequest) {
    if (!adminDb || !admin.firestore.FieldValue) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }
    
    try {
        const { role } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
            key: z.string().min(1, "Key is required"),
            connectionData: z.record(z.any()),
            setActive: z.boolean().optional().default(false),
            entityId: z.string(),
            entityType: z.enum(['user', 'company']),
            isPartner: z.boolean().optional().default(false),
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, connectionData, setActive, entityId, entityType, isPartner } = validationResult.data;
        
        let settingsRef: FirebaseFirestore.DocumentReference;
        
        if (isPartner && role === 'super_admin') {
            settingsRef = adminDb.collection('companies').doc('global_settings');
            const validation = partnerAppConnectionDataSchema.safeParse(connectionData);
            if (!validation.success) { return NextResponse.json({ error: "Invalid Partner App data", details: validation.error.flatten() }, { status: 400 }); }
        } else if (!isPartner) {
            const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
            settingsRef = adminDb.collection(settingsCollection).doc(entityId);
            const validation = connectionDataSchema.safeParse(connectionData);
            if (!validation.success) { return NextResponse.json({ error: "Invalid connection data", details: validation.error.flatten() }, { status: 400 }); }
        } else {
             return NextResponse.json({ error: 'Forbidden: Only Super Admins can edit global partner credentials.' }, { status: 403 });
        }
        
        const settingsDoc = await settingsRef.get();
        const existingConnections = settingsDoc.exists ? settingsDoc.data()?.connections || {} : {};

        const mergedConnectionData = {
            ...(existingConnections[key] || {}),
            ...connectionData
        };

        const updatePayload: { [key: string]: any } = {
            [`connections.${key}`]: mergedConnectionData
        };

        if (setActive && !isPartner) {
            updatePayload.activeConnectionKey = key;
        }
        
        await settingsRef.set(updatePayload, { merge: true });

        if (!isPartner) {
            const data = connectionData as ConnectionData;
            const { wooCommerceStoreUrl, wordpressApiUrl, shopifyStoreUrl } = data;
            const hostnamesToAdd = new Set<string>();

            const addHostname = (url: string | undefined) => {
                if (url) {
                    try { 
                        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
                        hostnamesToAdd.add(new URL(fullUrl).hostname); 
                    }
                    catch { console.warn(`Invalid URL provided, skipping remote pattern: ${url}`); }
                }
            };
            addHostname(wooCommerceStoreUrl);
            addHostname(wordpressApiUrl);
            addHostname(shopifyStoreUrl);
            
            if (hostnamesToAdd.size > 0) {
                const promises = Array.from(hostnamesToAdd).map(hostname => addRemotePattern(hostname).catch(err => console.error(`Failed to add remote pattern for ${hostname}:`, err)));
                await Promise.all(promises);
            }
        }

        return NextResponse.json({ success: true, message: 'Connection saved successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: errorMessage || 'Failed to save connections' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    if (!adminDb || !admin.firestore.FieldValue) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { role } = await getUserContext(req);
        const body = await req.json();

        const payloadSchema = z.object({
            key: z.string().min(1, "Key is required"),
            entityId: z.string(),
            entityType: z.enum(['user', 'company']),
        });
        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, entityId, entityType } = validationResult.data;
        
        let settingsRef: FirebaseFirestore.DocumentReference;

        if (key === 'partner_app') {
            if (role !== 'super_admin') {
                return NextResponse.json({ error: 'Forbidden: Only Super Admins can delete global partner credentials.' }, { status: 403 });
            }
            settingsRef = adminDb.collection('companies').doc('global_settings');
        } else {
            const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
            settingsRef = adminDb.collection(settingsCollection).doc(entityId);
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
            const otherKeys = Object.keys(currentData.connections || {}).filter(k => k !== key && k !== 'partner_app');
            updatePayload.activeConnectionKey = otherKeys.length > 0 ? otherKeys[0] : null;
        }
        
        await settingsRef.update(updatePayload);

        return NextResponse.json({ success: true, message: 'Connection deleted successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        return NextResponse.json({ error: errorMessage || 'Failed to delete connection' }, { status: 500 });
    }
}
