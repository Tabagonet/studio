
// src/app/api/upload-image-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import {
  MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL,
  ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL,
  LOCAL_UPLOAD_RAW_DIR_RELATIVE,
} from '@/lib/local-storage-constants'; // Create this file

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const batchId = formData.get('batchId') as string | null;
    const userId = formData.get('userId') as string | null; // Not used yet, but good to have
    const fileName = formData.get('fileName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required.' }, { status: 400 });
    }
    if (!fileName) {
      return NextResponse.json({ error: 'fileName is required.' }, { status: 400 });
    }

    // Basic validation
    if (file.size > MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL) {
      return NextResponse.json({ error: `File exceeds max size of ${MAX_FILE_SIZE_BYTES_API_UPLOAD_LOCAL / (1024*1024)}MB.` }, { status: 413 });
    }
    if (!ALLOWED_MIME_TYPES_API_UPLOAD_LOCAL.includes(file.type)) {
       return NextResponse.json({ error: `Invalid file type: ${file.type}. Expected JPG/JPEG.` }, { status: 415 });
    }

    // Sanitize fileName to prevent path traversal, though original name is used for now
    const safeFileName = path.basename(fileName);

    const rawUploadDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId);
    await fs.mkdir(rawUploadDir, { recursive: true });

    const localFilePath = path.join(rawUploadDir, safeFileName);
    const relativePath = path.join('/', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId, safeFileName).replace(/\\\\/g, '/');


    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(localFilePath, buffer);

    console.log(`[API /api/upload-image-local] File ${safeFileName} saved to ${localFilePath} for batch ${batchId}`);

    return NextResponse.json({ 
      message: 'File uploaded successfully to local server.', 
      filePath: localFilePath, // Absolute path on server
      relativePath: relativePath // Relative path for public serving
    }, { status: 200 });

  } catch (error) {
    console.error('[API /api/upload-image-local] Error uploading file:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to upload file.', details: errorMessage }, { status: 500 });
  }
}

