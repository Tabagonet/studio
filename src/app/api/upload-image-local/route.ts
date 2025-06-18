
// src/app/api/upload-image-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { adminAuth } from '@/lib/firebase-admin';
import {
  MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL,
  ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL,
  LOCAL_UPLOAD_RAW_DIR_RELATIVE,
} from '@/lib/local-storage-constants';

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.split("Bearer ")[1];
  if (!token) {
    return NextResponse.json({ success: false, error: "No se proporcionó token" }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Error verificando token en /api/upload-image-local:", error);
    return NextResponse.json({ success: false, error: `Token inválido: ${errorMessage}` }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null; // Changed from 'imagen' to 'file' to be more generic
    const batchId = formData.get('batchId') as string | null;
    const originalFileName = formData.get('fileName') as string | null; // Original name from client

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided.' }, { status: 400 });
    }
    if (!batchId) {
      return NextResponse.json({ success: false, error: 'batchId is required.' }, { status: 400 });
    }
    if (!originalFileName) {
      return NextResponse.json({ success: false, error: 'originalFileName is required.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL) {
      return NextResponse.json({ success: false, error: `File exceeds max size of ${MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL / (1024*1024)}MB.` }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.includes(file.type)) {
       return NextResponse.json({ success: false, error: `Invalid file type: ${file.type}. Expected: ${ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.join(', ')}` }, { status: 415 });
    }

    // Sanitize originalFileName to prevent path traversal, and keep it for storage
    const safeFileName = path.basename(originalFileName);

    const rawUploadDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId);
    await fs.mkdir(rawUploadDir, { recursive: true });

    const localFilePathAbsolute = path.join(rawUploadDir, safeFileName);
    // Relative path for storing in Firestore, will be used to reconstruct absolute path on server
    const relativePathForDB = path.join('/', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId, safeFileName).replace(/\\\\/g, '/');


    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(localFilePathAbsolute, buffer);

    console.log(`[API /api/upload-image-local] File ${safeFileName} saved to ${localFilePathAbsolute} for batch ${batchId}`);

    return NextResponse.json({ 
      success: true,
      message: 'File uploaded successfully to local server.', 
      absolutePath: localFilePathAbsolute, 
      relativePath: relativePathForDB // This path will be stored in Firestore
    }, { status: 200 });

  } catch (error) {
    console.error('[API /api/upload-image-local] Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, error: 'Failed to upload file to local server.', details: errorMessage }, { status: 500 });
  }
}
