
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

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
            return NextResponse.json({ connections: {}, prompts: {} });
        }
        
        const settings = userSettingsDoc.data() || {};
        
        // We only want to export connections and prompts
        const exportData = {
            connections: settings.connections || {},
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const headers = new Headers();
        headers.set('Content-Type', 'application/json');
        const formattedDate = new Date().toISOString().split('T')[0];
        headers.set('Content-Disposition', `attachment; filename="wooautomate_settings_${formattedDate}.json"`);

        return new NextResponse(jsonString, { headers });

    } catch (error: any) {
        console.error('Error exporting user settings:', error);
        return NextResponse.json({ error: error.message || 'Failed to export settings' }, { status: 500 });
    }
}
