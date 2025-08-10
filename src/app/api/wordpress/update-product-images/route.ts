// src/app/api/wordpress/update-product-images/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/api-helpers';
import { z } from 'zod';

const updateImagesSchema = z.object({
  product_id: z.number(),
  mode: z.enum(['add', 'replace', 'remove', 'clear']),
  images: z.array(z.string()), // Array of URLs or numeric string IDs
});

export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed: ' + e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = updateImagesSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { product_id, mode, images: imageUrlsOrIds } = validation.data;
        const { wooApi, wpApi } = await getApiClientsForUser(uid);
        if (!wooApi || !wpApi) {
            throw new Error('API clients are not configured.');
        }

        const { data: product } = await wooApi.get(`products/${product_id}`);
        if (!product) {
            return new Response(`Product with ID ${product_id} not found`, { status: 404 });
        }
        
        const current_ids = product.images.map((img: any) => img.id);
        const new_ids = [];

        for (const img of imageUrlsOrIds) {
            // Check if it's a numeric string representing an existing ID
            if (/^\d+$/.test(img)) {
                new_ids.push(Number(img));
            } 
            // Check if it's a URL to be sideloaded
            else if (img.startsWith('http')) {
                 const newId = await uploadImageToWordPress(
                    img, 
                    `${product.slug || 'product'}-${product_id}-${new_ids.length}.webp`,
                    { title: product.name, alt_text: product.name, caption: '', description: '' },
                    wpApi
                );
                new_ids.push(newId);
            }
        }
        
        let final_ids: number[] = [];
        switch (mode) {
            case 'add':
                final_ids = Array.from(new Set([...current_ids, ...new_ids]));
                break;
            case 'replace':
                final_ids = new_ids;
                break;
            case 'remove':
                final_ids = current_ids.filter((id: number) => !new_ids.includes(id));
                break;
            case 'clear':
                final_ids = [];
                break;
        }

        const wooPayload = {
            images: final_ids.map(id => ({ id }))
        };

        const updateResponse = await wooApi.put(`products/${product_id}`, wooPayload);

        return NextResponse.json({
            status: 'success',
            product_id: product_id,
            images: updateResponse.data.images.map((img: any) => img.id)
        });

    } catch (error: any) {
        console.error("Error in /update-product-images:", error);
        return NextResponse.json({ error: 'Failed to update images', details: error.message }, { status: 500 });
    }
}
