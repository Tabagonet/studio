// src/app/api/process-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import sharp from 'sharp';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
    // Basic authentication to ensure it's called from our own backend
    try {
        const token = req.headers.get("Authorization")?.split("Bearer ")[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token); // Verify it's a valid token from our app
    } catch (e: any) {
        return NextResponse.json({ error: `Unauthorized: ${e.message}` }, { status: 401 });
    }

    try {
        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 });
        }
        
        // Use axios to fetch the image as an arraybuffer, which is more reliable
        const imageResponse = await axios.get(imageUrl, { 
            responseType: 'arraybuffer',
            timeout: 10000, // 10-second timeout
        });
        const originalBuffer = Buffer.from(imageResponse.data, 'binary');

        // You can keep the sharp processing if needed, or just return the original
        const processedBuffer = await sharp(originalBuffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toBuffer();
        
        const contentType = imageResponse.headers['content-type'] || 'image/webp';
        
        // Use the standard Web API Response object, which Next.js supports
        // and correctly handles Node.js Buffers.
        return new Response(processedBuffer, {
            status: 200,
            headers: { 'Content-Type': contentType }
        });

    } catch (error: any) {
        console.error('[API process-image] Error processing image:', error.message);
        return NextResponse.json({ error: `Error processing image: ${error.message}` }, { status: 500 });
    }
}
