
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


export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
        const targetCompanyId = req.nextUrl.searchParams.get('companyId');
        const targetUserId = req.nextUrl.searchParams.get('userId');
        
        let settingsRef;

        if (role === 'super_admin') {
            if (targetCompanyId) {
                settingsRef = adminDb.collection('companies').doc(targetCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(targetUserId || uid);
            }
        } else {
            if (userCompanyId) {
                settingsRef = adminDb.collection('companies').doc(userCompanyId);
            } else {
                settingsRef = adminDb.collection('user_settings').doc(uid);
            }
        }
        
        const settingsDoc = await settingsRef.get();
        const globalSettingsDoc = await adminDb.collection('companies').doc('global_settings').get();

        const allConnections = settingsDoc.exists ? settingsDoc.data()?.connections || {} : {};
        const partnerAppData = globalSettingsDoc.exists ? globalSettingsDoc.data()?.connections?.partner_app || null : null;
        
        if (partnerAppData) {
            allConnections.partner_app = partnerAppData;
        }

        return NextResponse.json({
            allConnections: allConnections,
            activeConnectionKey: settingsDoc.exists ? settingsDoc.data()?.activeConnectionKey || null : null,
            partnerAppData: partnerAppData,
        });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error fetching connections:', error);
        return NextResponse.json({ error: errorMessage || 'Authentication required' }, { status: 401 });
    }
}

export async function POST(req: NextRequest) {
    if (!adminDb) {
        console.error('POST /api/user-settings/connections: Firestore no está configurado en el servidor');
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }
    
    try {
        const { uid, role, companyId: userCompanyId } = await getUserContext(req);
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
        
        let settingsRef;
        let finalConnectionData;
        let existingConnections;
        
        // --- Determine the correct Firestore document to update ---
        if (isPartner && role === 'super_admin') {
            // Partner creds are always global, edited by Super Admin
            settingsRef = adminDb.collection('companies').doc('global_settings');
            const validation = partnerAppConnectionDataSchema.safeParse(connectionData);
            if (!validation.success) { return NextResponse.json({ error: "Invalid Partner App data", details: validation.error.flatten() }, { status: 400 }); }
            finalConnectionData = validation.data;
        } else {
             // Regular connections depend on the entity being edited
            const settingsCollection = entityType === 'company' ? 'companies' : 'user_settings';
            settingsRef = adminDb.collection(settingsCollection).doc(entityId);
            const validation = connectionDataSchema.safeParse(connectionData);
            if (!validation.success) { return NextResponse.json({ error: "Invalid connection data", details: validation.error.flatten() }, { status: 400 }); }
            finalConnectionData = validation.data;
        }
        
        const settingsDoc = await settingsRef.get();
        existingConnections = settingsDoc.exists ? settingsDoc.data()?.connections || {} : {};

        // Merge new data with any existing data for the same key to prevent overwriting partial updates
        const mergedConnectionData = {
            ...(existingConnections[key] || {}),
            ...finalConnectionData
        };

        const updatePayload: { [key: string]: any } = {
            connections: {
                ...existingConnections,
                [key]: mergedConnectionData
            }
        };

        // Set active key only if it's a regular connection, not partner creds
        if (setActive && !isPartner) {
            updatePayload.activeConnectionKey = key;
        }

        await settingsRef.set(updatePayload, { merge: true });
        
        // If not partner creds, handle remote patterns for images
        if (!isPartner) {
             const { wooCommerceStoreUrl, wordpressApiUrl, shopifyStoreUrl } = finalConnectionData;
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
        console.error('POST /api/user-settings/connections: Error al guardar conexiones', error);
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
        let settingsRef;

        // If it's the partner_app key, always target the global settings document.
        if (key === 'partner_app' && role === 'super_admin') {
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

        // If we are deleting the active key, find a new one to set as active.
        if (currentData?.activeConnectionKey === key) {
            const otherKeys = Object.keys(currentData.connections || {}).filter(k => k !== key && k !== 'partner_app');
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
