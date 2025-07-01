
// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

// This function checks if the requesting user is an admin.
async function isAdmin(req: NextRequest): Promise<boolean> {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) return false;

    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
        return userDoc.exists && userDoc.data()?.role === 'admin';
    } catch (error) {
        console.error("Admin check failed:", error);
        return false;
    }
}

export async function GET(req: NextRequest) {
    if (!await isAdmin(req)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured' }, { status: 503 });
    }

    try {
        const usersSnapshot = await adminDb.collection('users').orderBy('createdAt', 'desc').get();
        const users = usersSnapshot.docs.map(doc => {
            const data = doc.data();
            // Fallback for users created before timestamp field was added
            const createdAt = data.createdAt ? data.createdAt.toDate().toISOString() : new Date(0).toISOString();
            return {
                uid: doc.id,
                email: data.email || '',
                displayName: data.displayName || 'No Name',
                photoURL: data.photoURL || '',
                role: data.role || 'pending',
                status: data.status || 'pending_approval',
                createdAt: createdAt,
            };
        });

        return NextResponse.json({ users });
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        console.error("Error fetching users for admin:", error);
        return NextResponse.json({ error: 'Failed to fetch users', details: errorMessage }, { status: 500 });
    }
}
