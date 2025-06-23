
import { NextRequest, NextResponse } from 'next/server';
import { admin, adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { addRemotePattern } from '@/lib/next-config-manager';

// Helper function to get user UID from token
async function getUserIdFromRequest(req: NextRequest): Promise<string> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken.uid;
}

// GET handler to fetch all user connections and the active one
export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();

        if (userSettingsDoc.exists) {
            const data = userSettingsDoc.data();
            return NextResponse.json({
                allConnections: data?.connections || {},
                activeConnectionKey: data?.activeConnectionKey || null,
            });
        }
        return NextResponse.json({ allConnections: {}, activeConnectionKey: null });
    } catch (error: any) {
        console.error('Error fetching user connections:', error);
        return NextResponse.json({ error: error.message || 'Authentication required' }, { status: 401 });
    }
}

const connectionDataSchema = z.object({
    wooCommerceStoreUrl: z.string().url().optional().or(z.literal('')),
    wooCommerceApiKey: z.string().optional(),
    wooCommerceApiSecret: z.string().optional(),
    wordpressApiUrl: z.string().url().optional().or(z.literal('')),
    wordpressUsername: z.string().optional(),
    wordpressApplicationPassword: z.string().optional(),
});

// POST handler to save/update a connection profile and optionally set it as active
export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }
    
    try {
        const uid = await getUserIdFromRequest(req);
        const body = await req.json();

        const payloadSchema = z.object({
            key: z.string().min(1, "Key is required"),
            connectionData: connectionDataSchema,
            setActive: z.boolean().optional().default(false),
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key, connectionData, setActive } = validationResult.data;

        // Save to Firestore first
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set({
            connections: {
                [key]: connectionData
            },
            ...(setActive && { activeConnectionKey: key })
        }, { merge: true });
        
        // Fire-and-forget adding hostnames to next.config.js for image optimization
        const { wooCommerceStoreUrl, wordpressApiUrl } = connectionData;
        const hostnamesToAdd = new Set<string>();

        if (wooCommerceStoreUrl) {
            try {
                hostnamesToAdd.add(new URL(wooCommerceStoreUrl).hostname);
            } catch {
                console.warn(`Invalid WooCommerce URL provided for remote pattern: ${wooCommerceStoreUrl}`);
            }
        }
        if (wordpressApiUrl) {
            try {
                hostnamesToAdd.add(new URL(wordpressApiUrl).hostname);
            } catch {
                console.warn(`Invalid WordPress URL provided for remote pattern: ${wordpressApiUrl}`);
            }
        }

        if (hostnamesToAdd.size > 0) {
            const promises = Array.from(hostnamesToAdd).map(hostname =>
                addRemotePattern(hostname).catch(err => {
                    // Log error but don't fail the request
                    console.error(`Failed to add remote pattern for ${hostname}:`, err);
                })
            );
            Promise.all(promises).catch(err => console.error("Error during batch remote pattern update:", err));
        }

        return NextResponse.json({ success: true, message: 'Connection saved successfully.' });

    } catch (error: any) {
        console.error('Error saving user connections:', error);
        const status = error.message.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: error.message || 'Failed to save connections' }, { status });
    }
}


// DELETE handler to remove a connection profile
export async function DELETE(req: NextRequest) {
    if (!adminDb || !admin.firestore.FieldValue) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        const body = await req.json();

        const payloadSchema = z.object({
            key: z.string().min(1, "Key is required"),
        });

        const validationResult = payloadSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid data', details: validationResult.error.flatten() }, { status: 400 });
        }
        
        const { key } = validationResult.data;
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        const doc = await userSettingsRef.get();
        const currentData = doc.data();

        // Prepare the update payload
        const updatePayload: { [key: string]: any } = {
            [`connections.${key}`]: admin.firestore.FieldValue.delete()
        };

        // If the deleted key was the active one, find a new active key or set it to null
        if (currentData?.activeConnectionKey === key) {
            const otherKeys = Object.keys(currentData.connections || {}).filter(k => k !== key);
            updatePayload.activeConnectionKey = otherKeys.length > 0 ? otherKeys[0] : null;
        }

        await userSettingsRef.update(updatePayload);

        return NextResponse.json({ success: true, message: 'Connection deleted successfully.' });

    } catch (error: any) {
        console.error('Error deleting user connection:', error);
        const status = error.message.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: error.message || 'Failed to delete connection' }, { status });
    }
}
