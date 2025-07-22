
// src/app/api/wordpress/menu-cloner/clone/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const cloneMenuSchema = z.object({
  menuId: z.number(),
  targetLang: z.string(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }
    
    if (!adminDb) {
        return NextResponse.json({ error: 'Firestore not configured.' }, { status: 503 });
    }

    try {
        const body = await req.json();
        const validation = cloneMenuSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { menuId, targetLang } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }

        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) {
            throw new Error("Could not determine base site URL.");
        }

        const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/clone-menu`;
        
        const response = await wpApi.post(cloneEndpoint, {
            menu_id: menuId,
            target_lang: targetLang,
        });

        if (response.data?.success) {
             return NextResponse.json({ success: true, message: response.data.message });
        } else {
             throw new Error(response.data?.message || 'The custom menu cloning endpoint failed.');
        }

    } catch (error: any) {
        console.error('Error cloning menu:', error.response?.data || error.message);
        const errorMessage = error.response?.data?.message || 'An unexpected error occurred.';
        const status = error.response?.status || 500;
        return NextResponse.json({ error: errorMessage }, { status });
    }
}
