
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const batchCloneSchema = z.object({
  post_ids: z.array(z.number()),
  target_lang: z.string(),
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = batchCloneSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { post_ids, target_lang } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) throw new Error('WordPress API is not configured');
        
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) throw new Error("Could not determine base site URL.");

        // === Call the new batch clone endpoint in the custom plugin ===
        const cloneEndpoint = `${siteUrl}/wp-json/custom/v1/batch-clone-posts`;
        const cloneResponse = await wpApi.post(cloneEndpoint, { post_ids, target_lang });
        
        if (cloneResponse.status !== 200) {
            throw new Error('Batch cloning via custom endpoint failed: ' + (cloneResponse.data.message || 'Unknown error from plugin.'));
        }

        return NextResponse.json({ success: true, message: 'Clonación en lote completada.', data: cloneResponse.data });

    } catch (error: any) {
        console.error("Error in batch clone endpoint:", error.response?.data || error.message);
        return NextResponse.json({ error: "Failed to clone content in batch", message: error.message }, { status: 500 });
    }
}
