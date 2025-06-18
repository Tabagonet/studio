
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, adminStorage, admin } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg'];

async function downloadImageFromURL(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url}. Status: ${response.status}`);
  }
  if (!response.body) {
    throw new Error(`Response body is null for image from ${url}.`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadBufferToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const bucket = adminStorage.bucket();
  const file = bucket.file(destinationPath);

  await file.save(buffer, {
    metadata: { contentType: contentType },
  });
  await file.makePublic();
  const downloadURL = file.publicUrl();
  return { downloadURL, storagePath: destinationPath };
}

async function triggerNextPhotoProcessing(batchId: string, requestUrl: string) {
  // Construct the full URL for the API endpoint
  // requestUrl already contains the base (e.g., http://localhost:3000 or https://your-app.vercel.app)
  // We just need to ensure the path is correct.
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  
  console.log(`[API /api/process-photos] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}`);
  
  // Fire-and-forget fetch call to process the next image in the batch
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  }).catch(error => {
    console.error(`[API /api/process-photos] Error self-triggering for batch ${batchId}:`, error);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}`);

    if (!adminDb || !adminStorage) {
      const missingService = !adminDb ? 'Firestore' : 'Storage';
      console.error(`[API /api/process-photos] Firebase Admin SDK (${missingService}) not initialized.`);
      return NextResponse.json({ error: `Server configuration error, Firebase Admin (${missingService}) not available.` }, { status: 500 });
    }

    // Find the first photo in the batch with 'uploaded' status
    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No more 'uploaded' photos found for batchId: ${batchId}. Batch processing likely complete or no pending images.`);
      // Check if there are any images still in a processing state for this batch to avoid premature "complete" message
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          return NextResponse.json({ message: `Batch ${batchId} processing complete. No more 'uploaded' or 'processing' images found.`, batchId: batchId, status: 'batch_completed' }, { status: 200 });
      } else {
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, but some are still processing.`, batchId: batchId, status: 'batch_in_progress' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photo = { id: photoDoc.id, ...photoDoc.data() };
    const photoDocRef = adminDb.collection('processing_status').doc(photo.id);

    console.log(`[API /api/process-photos] Starting processing for: ${photo.imageName} (Doc ID: ${photo.id}) in batch ${batchId}`);
    
    let processedSuccessfully = false;

    try {
      await photoDocRef.update({ 
        status: 'processing_image_started', 
        progress: 5, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      if (!photo.originalDownloadUrl) {
          throw new Error(`Missing originalDownloadUrl for ${photo.imageName}`);
      }
      console.log(`[API /api/process-photos] Downloading ${photo.imageName} from ${photo.originalDownloadUrl}`);
      const imageBuffer = await downloadImageFromURL(photo.originalDownloadUrl as string);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded' });
      
      console.log(`[API /api/process-photos] Validating file type and size for ${photo.imageName}`);
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES) {
          throw new Error(`File ${photo.imageName} exceeds max size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photo.imageName}: ${type?.mime || 'unknown'}. Expected JPG.`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated' });

      console.log(`[API /api/process-photos] Optimizing image ${photo.imageName} with Sharp`);
      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({ exif: {} }) // Attempt to strip all EXIF
                                      .toBuffer();
      await photoDocRef.update({ progress: 50, status: 'processing_image_optimized' });

      const seoName = `${photo.imageName?.replace(/\.(jpe?g|png|gif)$/i, '') || `image-${photo.id}`}.webp`;
      console.log(`[API /api/process-photos] TODO: Generate SEO name for ${photo.imageName}. Using: ${seoName}`);
      await photoDocRef.update({ progress: 60, seoName: seoName, status: 'processing_image_seo_named' });

      const seoMetadata = { alt: `Alt text for ${seoName}`, title: `Title for ${seoName}` };
      console.log(`[API /api/process-photos] TODO: Generate SEO metadata for ${photo.imageName}`);
      await photoDocRef.update({ progress: 75, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated' });
      
      const userId = photo.userId || 'temp_user_id';
      const processedImageStoragePath = `processed_uploads/${userId}/${batchId}/${seoName}`;
      console.log(`[API /api/process-photos] Uploading processed version of ${photo.imageName} to ${processedImageStoragePath}`);
      
      const { downloadURL: processedImageDownloadUrl, storagePath: finalProcessedPath } = await uploadBufferToStorage(
        processedImageBuffer,
        processedImageStoragePath,
        'image/webp'
      );
      await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded' });
      
      await photoDocRef.update({ 
          status: 'completed_image_pending_woocommerce', 
          processedImageDownloadUrl: processedImageDownloadUrl,
          processedImageStoragePath: finalProcessedPath,
          progress: 100, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      console.log(`[API /api/process-photos] Successfully processed ${photo.imageName}. Status 'completed_image_pending_woocommerce'`);
      processedSuccessfully = true;

    } catch (imageError) {
      console.error(`[API /api/process-photos] Error processing ${photo.imageName} (Doc ID: ${photo.id}):`, imageError);
      await photoDocRef.update({ 
        status: 'error_processing_image', 
        errorMessage: imageError instanceof Error ? imageError.message : String(imageError),
        progress: (photo.progress as number || 0),
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
    }

    // After processing (or attempting to process) the current photo,
    // check if there are more 'uploaded' photos in this batch.
    const remainingPhotosSnapshot = await adminDb.collection('processing_status')
                                        .where('batchId', '==', batchId)
                                        .where('status', '==', 'uploaded')
                                        .limit(1) // We only need to know if at least one exists
                                        .get();

    if (!remainingPhotosSnapshot.empty) {
      console.log(`[API /api/process-photos] More images to process for batch ${batchId}. Triggering next.`);
      // Pass the original request's URL to construct the full API URL for self-triggering
      await triggerNextPhotoProcessing(batchId, request.url);
      return NextResponse.json({ 
        message: `Processed ${photo.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). Triggering next photo in batch ${batchId}.`,
        batchId: batchId,
        processedPhotoId: photo.id,
        status: 'batch_in_progress' 
      });
    } else {
      console.log(`[API /api/process-photos] No more 'uploaded' images after processing ${photo.imageName} for batch ${batchId}.`);
       // Check if there are any images still in a processing state for this batch
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          return NextResponse.json({ 
            message: `Processed ${photo.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). Batch ${batchId} processing complete.`,
            batchId: batchId,
            processedPhotoId: photo.id,
            status: 'batch_completed'
          });
      } else {
           return NextResponse.json({ 
            message: `Processed ${photo.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). No more 'uploaded' photos for batch ${batchId}, but some are still processing.`,
            batchId: batchId,
            processedPhotoId: photo.id,
            status: 'batch_in_progress'
          });
      }
    }

  } catch (error) {
    console.error('[API /api/process-photos] General Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to process request', details: errorMessage, status: 'error_general' }, { status: 500 });
  }
}

    