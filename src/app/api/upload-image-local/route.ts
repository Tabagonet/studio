
// src/app/api/upload-image-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { adminAuth } from '@/lib/firebase-admin';
import { LOCAL_UPLOAD_RAW_DIR_RELATIVE, LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL, ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL } from '@/lib/local-storage-constants';

export async function POST(req: NextRequest) {
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        await adminAuth.verifyIdToken(token);
    } catch (e: any) {
        return NextResponse.json({ success: false, error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get('imagen') as File | null;

        if (!file) {
            return NextResponse.json({ success: false, error: 'No image file provided.' }, { status: 400 });
        }
        
        if (file.size > MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL) {
            return NextResponse.json({ success: false, error: `File size exceeds limit of ${MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL / 1024 / 1024}MB.` }, { status: 413 });
        }

        if (!ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.includes(file.type)) {
             return NextResponse.json({ success: false, error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.join(', ')}` }, { status: 415 });
        }
        
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        const rawDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_RAW_DIR_RELATIVE);
        const processedDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE);

        await fs.mkdir(rawDir, { recursive: true });
        await fs.mkdir(processedDir, { recursive: true });

        const rawFilePath = path.join(rawDir, file.name);
        await fs.writeFile(rawFilePath, buffer);

        // Process the image with sharp
        const processedFilename = `${path.parse(file.name).name}.webp`;
        const processedFilePath = path.join(processedDir, processedFilename);
        
        await sharp(buffer)
            .resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toFile(processedFilePath);
        
        const publicUrl = `/${LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE}/${processedFilename}`;

        return NextResponse.json({
            success: true,
            url: publicUrl,
            filename_saved_on_server: processedFilename,
        });

    } catch (error: any) {
        console.error('[API upload-image-local] Error:', error);
        return NextResponse.json({ success: false, error: 'Failed to upload or process image.', message: error.message }, { status: 500 });
    }
}
