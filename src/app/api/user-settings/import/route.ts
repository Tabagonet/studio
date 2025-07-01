
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { z } from 'zod';
import { addRemotePattern } from '@/lib/next-config-manager';

// Helper to get user ID from token
async function getUserIdFromRequest(req: NextRequest): Promise<string> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken.uid;
}

// Zod schema for validating the structure of the imported JSON file.
// This should match the structure of the exported file.
const connectionDataSchema = z.object({
    wooCommerceStoreUrl: z.union([z.string().url({ message: "Invalid WooCommerce Store URL" }), z.literal('')]).optional(),
    wooCommerceApiKey: z.string().optional(),
    wooCommerceApiSecret: z.string().optional(),
    wordpressApiUrl: z.union([z.string().url({ message: "Invalid WordPress API URL" }), z.literal('')]).optional(),
    wordpressUsername: z.string().optional(),
    wordpressApplicationPassword: z.string().optional(),
    promptTemplate: z.string().optional(),
});

const importSchema = z.object({
  connections: z.record(z.string(), connectionDataSchema),
  activeConnectionKey: z.string().nullable(),
});

export async function POST(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        const body = await req.json();

        const validationResult = importSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid JSON file structure.', details: validationResult.error.flatten() }, { status: 400 });
        }

        const importedData = validationResult.data;

        // Merge the imported settings into the user's document
        const userSettingsRef = adminDb.collection('user_settings').doc(uid);
        await userSettingsRef.set(importedData, { merge: true });

        // Fire-and-forget adding hostnames to next.config.js for image optimization
        const hostnames = Object.values(importedData.connections)
            .flatMap(conn => [conn.wooCommerceStoreUrl, conn.wordpressApiUrl])
            .filter((url): url is string => !!url)
            .map(url => {
                try { return new URL(url).hostname; }
                catch { return null; }
            })
            .filter((hostname): hostname is string => !!hostname);

        if (hostnames.length > 0) {
            const uniqueHostnames = [...new Set(hostnames)];
            Promise.all(uniqueHostnames.map(hostname => addRemotePattern(hostname).catch(err => {
                // Log error but don't fail the request
                console.error(`Failed to add remote pattern for ${hostname}:`, err);
            }))).catch(err => console.error("Error during batch remote pattern update:", err));
        }

        return NextResponse.json({ success: true, message: 'Settings imported successfully.' });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error importing user settings:', error);
        const status = errorMessage.includes('Authentication') ? 401 : 500;
        return NextResponse.json({ error: errorMessage || 'Failed to import settings' }, { status });
    }
}
