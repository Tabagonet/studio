
// src/app/api/process-image/route.ts
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import sharp from 'sharp';
import { adminAuth } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
    // Basic authentication to ensure it's called from our own backend
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token); // Verify it's a valid token from our app
    } catch (e: any) {
        return new Response('Unauthorized', { status: 401 });
    }

    try {
        const { imageUrl } = await req.json();
        if (!imageUrl) {
            return new Response('imageUrl is required', { status: 400 });
        }

        const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const originalBuffer = Buffer.from(imageResponse.data, 'binary');

        const processedBuffer = await sharp(originalBuffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();

        // Convert Node.js Buffer to ArrayBuffer for the Response constructor
        const arrayBuffer = processedBuffer.buffer.slice(processedBuffer.byteOffset, processedBuffer.byteOffset + processedBuffer.byteLength);

        return new Response(arrayBuffer, {
            status: 200,
            headers: { 'Content-Type': 'image/webp' }
        });

    } catch (error: any) {
        console.error('[API process-image] Error processing image:', error.message);
        return new Response(`Error processing image: ${error.message}`, { status: 500 });
    }
}
