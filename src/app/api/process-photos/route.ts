
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
  // TODO: For production, consider using signed URLs instead of making files public.
  // For now, makePublic is used for simplicity during development.
  await file.makePublic(); 
  const downloadURL = file.publicUrl();
  return { downloadURL, storagePath: destinationPath };
}

function generateSeoFilename(originalName: string): string {
  const nameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  
  let seoName = nameWithoutExtension
    .toLowerCase()
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '') // Remove non-alphanumeric characters except hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with a single one
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens

  if (!seoName) { // Fallback if name becomes empty after cleaning
    seoName = `image-${Date.now()}`;
  }
  return `${seoName}.webp`;
}

function generateSeoAltText(seoFilename: string): string {
  const nameWithoutExtension = seoFilename.substring(0, seoFilename.lastIndexOf('.webp')) || seoFilename;
  const productName = nameWithoutExtension.replace(/-/g, ' '); // Replace hyphens with spaces
  // Capitalize first letter of each word for better readability
  const capitalizedProductName = productName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return `Imagen de ${capitalizedProductName}`;
}


async function triggerNextPhotoProcessing(batchId: string, requestUrl: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API /api/process-photos] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}`);
  
  fetch(apiUrl, { // Fire-and-forget
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

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No more 'uploaded' photos found for batchId: ${batchId}.`);
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          return NextResponse.json({ message: `Batch ${batchId} processing complete. No more 'uploaded' or 'processing' images found.`, batchId: batchId, status: 'batch_completed' }, { status: 200 });
      } else {
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, but some are still processing.`, batchId: batchId, status: 'batch_in_progress' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() }; // Renamed to photoData to avoid conflict with sharp variable
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);

    console.log(`[API /api/process-photos] Starting processing for: ${photoData.imageName} (Doc ID: ${photoData.id}) in batch ${batchId}`);
    
    let processedSuccessfully = false;

    try {
      await photoDocRef.update({ 
        status: 'processing_image_started', 
        progress: 5, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      if (!photoData.originalDownloadUrl) {
          throw new Error(`Missing originalDownloadUrl for ${photoData.imageName}`);
      }
      console.log(`[API /api/process-photos] Downloading ${photoData.imageName} from ${photoData.originalDownloadUrl}`);
      const imageBuffer = await downloadImageFromURL(photoData.originalDownloadUrl as string);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded' });
      
      console.log(`[API /api/process-photos] Validating file type and size for ${photoData.imageName}`);
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES) {
          throw new Error(`File ${photoData.imageName} exceeds max size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photoData.imageName}: ${type?.mime || 'unknown'}. Expected JPG.`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated' });

      console.log(`[API /api/process-photos] Optimizing image ${photoData.imageName} with Sharp`);
      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) // Attempt to strip all EXIF by passing an empty object
                                      .toBuffer();
      await photoDocRef.update({ progress: 50, status: 'processing_image_optimized' });
      
      const generatedSeoName = generateSeoFilename(photoData.imageName as string);
      console.log(`[API /api/process-photos] Generated SEO name for ${photoData.imageName}: ${generatedSeoName}`);
      await photoDocRef.update({ progress: 60, seoName: generatedSeoName, status: 'processing_image_seo_named' });

      // TODO: Integrate Genkit flow for advanced SEO metadata (alt text, title) generation based on image content or product keywords.
      const altText = generateSeoAltText(generatedSeoName);
      const seoMetadata = { alt: altText, title: altText }; // Using same for title for now
      console.log(`[API /api/process-photos] Generated SEO metadata for ${photoData.imageName}:`, seoMetadata);
      await photoDocRef.update({ progress: 75, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated' });
      
      const userId = photoData.userId || 'temp_user_id';
      const processedImageStoragePath = `processed_uploads/${userId}/${batchId}/${generatedSeoName}`;
      console.log(`[API /api/process-photos] Uploading processed version of ${photoData.imageName} to ${processedImageStoragePath}`);
      
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
      console.log(`[API /api/process-photos] Successfully processed ${photoData.imageName}. Status 'completed_image_pending_woocommerce'`);
      processedSuccessfully = true;

    } catch (imageError) {
      console.error(`[API /api/process-photos] Error processing ${photoData.imageName} (Doc ID: ${photoData.id}):`, imageError);
      const currentProgress = (photoData.progress as number || 0);
      await photoDocRef.update({ 
        status: 'error_processing_image', 
        errorMessage: imageError instanceof Error ? imageError.message : String(imageError),
        progress: currentProgress, // Keep current progress or a relevant value
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
    }

    const remainingPhotosSnapshot = await adminDb.collection('processing_status')
                                        .where('batchId', '==', batchId)
                                        .where('status', '==', 'uploaded')
                                        .limit(1)
                                        .get();

    if (!remainingPhotosSnapshot.empty) {
      console.log(`[API /api/process-photos] More images to process for batch ${batchId}. Triggering next.`);
      await triggerNextPhotoProcessing(batchId, request.url);
      return NextResponse.json({ 
        message: `Processed ${photoData.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). Triggering next photo in batch ${batchId}.`,
        batchId: batchId,
        processedPhotoId: photoData.id,
        status: 'batch_in_progress' 
      });
    } else {
      console.log(`[API /api/process-photos] No more 'uploaded' images after processing ${photoData.imageName} for batch ${batchId}.`);
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          return NextResponse.json({ 
            message: `Processed ${photoData.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). Batch ${batchId} processing complete.`,
            batchId: batchId,
            processedPhotoId: photoData.id,
            status: 'batch_completed'
          });
      } else {
           return NextResponse.json({ 
            message: `Processed ${photoData.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). No more 'uploaded' photos for batch ${batchId}, but some are still processing.`,
            batchId: batchId,
            processedPhotoId: photoData.id,
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
    

    