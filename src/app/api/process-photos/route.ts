
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, adminStorage, admin } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg']; // Only accepting JPEG for initial upload as per spec

// Helper function to download an image from a URL
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

// Helper function to upload a buffer to Firebase Storage
async function uploadBufferToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType: string
): Promise<{ downloadURL: string; storagePath: string }> {
  const bucket = adminStorage.bucket(); // Ensure adminStorage is initialized with a default bucket or specify one.
  const file = bucket.file(destinationPath);

  await file.save(buffer, {
    metadata: {
      contentType: contentType, // e.g., 'image/webp'
    },
  });

  // Make the file public for a limited time or use signed URLs for better security if needed.
  // For simplicity in phase 1, making it public readable.
  // In a production app, signed URLs with short expiry are preferred.
  await file.makePublic();
  const downloadURL = file.publicUrl();

  return { downloadURL, storagePath: destinationPath };
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
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No 'uploaded' photos found for batchId: ${batchId}. Processing might be complete or batch is invalid.`);
      return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}.`, batchId: batchId }, { status: 200 });
    }

    const photosData = photosToProcessSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    console.log(`[API /api/process-photos] Found ${photosData.length} photos to process for batchId ${batchId}:`, photosData.map(p => p.imageName));
    
    // TODO: Vercel Execution Limits
    // Processing many images sequentially here WILL hit Vercel's execution time limits (e.g., 10-60s).
    // For production, this loop needs to be broken down. Options:
    // 1. Process only a small chunk (e.g., 1-3 images) per invocation and have the function re-trigger itself 
    //    (e.g., via an HTTP call to a dedicated processing endpoint, or by managing a queue in Firestore).
    // 2. Use a dedicated background task/queue service (e.g., Google Cloud Tasks, Pub/Sub - might have costs).
    // For now, we'll process sequentially and log. This will work for 1-2 images but fail for larger batches.

    let processedCount = 0;
    for (const photo of photosData) {
      const photoDocRef = adminDb.collection('processing_status').doc(photo.id);
      console.log(`[API /api/process-photos] Starting processing for: ${photo.imageName} (Doc ID: ${photo.id})`);
      
      try {
        // 0. Update status to 'processing_image' in Firestore
        await photoDocRef.update({ 
          status: 'processing_image_started', 
          progress: 5, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });

        // 1. Download image from photo.originalDownloadUrl
        if (!photo.originalDownloadUrl) {
            throw new Error(`Missing originalDownloadUrl for ${photo.imageName}`);
        }
        console.log(`[API /api/process-photos] Downloading ${photo.imageName} from ${photo.originalDownloadUrl}`);
        const imageBuffer = await downloadImageFromURL(photo.originalDownloadUrl as string);
        await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded' });
        
        // 2. Validate file type and size (backend validation)
        console.log(`[API /api/process-photos] Validating file type and size for ${photo.imageName}`);
        if (imageBuffer.length > MAX_FILE_SIZE_BYTES) {
            throw new Error(`File ${photo.imageName} exceeds max size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
        }
        const type = await fileTypeFromBuffer(imageBuffer);
        if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
            throw new Error(`Invalid file type for ${photo.imageName}: ${type?.mime || 'unknown'}. Expected JPG.`);
        }
        await photoDocRef.update({ progress: 25, status: 'processing_image_validated' });

        // 3. Optimize with Sharp: WebP, EXIF removal, resolutions
        console.log(`[API /api/process-photos] Optimizing image ${photo.imageName} with Sharp`);
        const sharpInstance = sharp(imageBuffer);
        
        // Convert to WebP, remove metadata, resize to 800x800 (main image)
        const processedImageBuffer = await sharpInstance
                                        .metadata() // Keep this to potentially use later if needed, but strip for output
                                        .then(({ width, height }) => {
                                            return sharp(imageBuffer) // re-init sharp with original buffer for operations
                                                .webp({ quality: 80 })
                                                .resize({
                                                    width: 800,
                                                    height: 800,
                                                    fit: 'inside', // Or 'cover', 'contain' based on requirements
                                                    withoutEnlargement: true 
                                                })
                                                .withMetadata( { exif: { IFD0: { Copyright: undefined } } } ) // Example of selectively removing or keeping some metadata
                                                .toBuffer();
                                        });
        
        // TODO: Generate other resolutions (300x300, 150x150) and upload them.
        // For now, only the main 800x800 WebP is created.
        await photoDocRef.update({ progress: 50, status: 'processing_image_optimized' });

        // 4. Generate SEO names using 'natural' library and templates
        // TODO: Implement SEO name generation (e.g., camiseta-nike-azul-sku123-1.webp)
        const seoName = `${photo.imageName?.replace(/\.(jpe?g|png|gif)$/i, '') || `image-${photo.id}`}.webp`;
        console.log(`[API /api/process-photos] TODO: Generate SEO name for ${photo.imageName}. Using: ${seoName}`);
        await photoDocRef.update({ progress: 60, seoName: seoName, status: 'processing_image_seo_named' });

        // 5. Generate SEO metadata (Alt, title, description, caption)
        // TODO: Implement SEO metadata generation
        const seoMetadata = { 
            alt: `Alt text for ${seoName}`, 
            title: `Title for ${seoName}` 
        };
        console.log(`[API /api/process-photos] TODO: Generate SEO metadata for ${photo.imageName}`);
        await photoDocRef.update({ progress: 75, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated' });
        
        // 6. Upload processed image back to Firebase Storage
        const userId = photo.userId || 'temp_user_id';
        const processedImageStoragePath = `processed_uploads/${userId}/${batchId}/${seoName}`;
        console.log(`[API /api/process-photos] Uploading processed version of ${photo.imageName} to ${processedImageStoragePath}`);
        
        const { downloadURL: processedImageDownloadUrl, storagePath: finalProcessedPath } = await uploadBufferToStorage(
          processedImageBuffer,
          processedImageStoragePath,
          'image/webp'
        );
        await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded' });
        
        // 7. Update Firestore with processed image URLs, SEO data, and final status
        await photoDocRef.update({ 
            status: 'completed_image_pending_woocommerce', 
            processedImageDownloadUrl: processedImageDownloadUrl,
            processedImageStoragePath: finalProcessedPath,
            progress: 100, 
            updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
        console.log(`[API /api/process-photos] Successfully processed ${photo.imageName}. Status 'completed_image_pending_woocommerce'`);
        processedCount++;

      } catch (imageError) {
        console.error(`[API /api/process-photos] Error processing ${photo.imageName} (Doc ID: ${photo.id}):`, imageError);
        await photoDocRef.update({ 
          status: 'error_processing_image', 
          errorMessage: imageError instanceof Error ? imageError.message : String(imageError),
          progress: (photo.progress as number || 0), // Keep current progress or reset, adjust as needed
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
      }
    }
    
    // TODO: After all images in the batch are processed (or attempted),
    // update overall batch status or trigger next step (e.g., WooCommerce product creation).
    // This might involve checking if all documents in 'processing_status' for this batchId 
    // are 'completed_image_pending_woocommerce' or 'error_processing_image'.
    // If using chunking, this logic changes significantly.

    return NextResponse.json({ 
      message: `Backend processing for batch ${batchId} initiated. Attempted to process ${photosData.length} photos. Successfully processed (simulated for now): ${processedCount}. Check server logs.`,
      batchId: batchId,
      filesFound: photosData.length,
      filesProcessedThisRun: processedCount
    });

  } catch (error) {
    console.error('[API /api/process-photos] General Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to process request', details: errorMessage }, { status: 500 });
  }
}
