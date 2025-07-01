
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

async function getUserIdFromRequest(req: NextRequest): Promise<string> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('Authentication token not provided.');
    
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    return decodedToken.uid;
}

export async function GET(req: NextRequest) {
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
    }

    try {
        const uid = await getUserIdFromRequest(req);
        const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();

        if (!userSettingsDoc.exists) {
            // Return an empty but correctly structured object if no settings exist
            return NextResponse.json({ connections: {}, activeConnectionKey: null });
        }
        
        const settings = userSettingsDoc.data() || {};
        
        // Include all relevant user settings for a complete backup
        const exportData = {
            connections: settings.connections || {},
            activeConnectionKey: settings.activeConnectionKey || null,
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        const formattedDate = new Date().toISOString().split('T')[0];
        headers.set('Content-Disposition', `attachment; filename="autopress_ai_settings_${formattedDate}.json"`);

        return new NextResponse(jsonString, { headers });

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error('Error exporting user settings:', error);
        return NextResponse.json({ error: errorMessage || 'Failed to export settings' }, { status: 500 });
    }
}
