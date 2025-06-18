
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase-admin'; // Firebase Admin SDK instance
// import sharp from 'sharp'; // Will be used in future steps
// import { fileTypeFromBuffer } from 'file-type'; // Will be used in future steps

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}`);

    if (!adminDb) {
      console.error('[API /api/process-photos] Firebase Admin SDK (Firestore) not initialized.');
      return NextResponse.json({ error: 'Server configuration error, Firebase Admin (Firestore) not available.' }, { status: 500 });
    }
     if (!adminStorage) {
      console.error('[API /api/process-photos] Firebase Admin SDK (Storage) not initialized.');
      return NextResponse.json({ error: 'Server configuration error, Firebase Admin (Storage) not available.' }, { status: 500 });
    }

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No 'uploaded' photos found for batchId: ${batchId}. Processing might be complete or batch is invalid.`);
      return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}. Processing might be complete or batch is invalid.`, batchId: batchId }, { status: 200 });
    }

    const photosData = photosToProcessSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()}));
    console.log(`[API /api/process-photos] Found ${photosData.length} photos to process for batchId ${batchId}:`, photosData.map(p => p.imageName));

    // Process each photo (simulated for now)
    // Note: Vercel functions have execution time limits (e.g., 10-15 seconds on hobby plan).
    // For a large number of photos, this loop would need to be broken into smaller chunks
    // or use a background task queue system.
    for (const photo of photosData) {
      const photoDocRef = adminDb.collection('processing_status').doc(photo.id);
      console.log(`[API /api/process-photos] Starting processing for: ${photo.imageName} (Doc ID: ${photo.id})`);
      
      try {
        // 0. Update status to 'processing_image' in Firestore
        await photoDocRef.update({ status: 'processing_image_pending', progress: 10, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[API /api/process-photos] Status updated to 'processing_image_pending' for ${photo.imageName}`);

        // 1. TODO: Download image from photo.originalUrl (Firebase Storage)
        //    Example: const imageBuffer = await downloadImage(photo.originalUrl);
        console.log(`[API /api/process-photos] TODO: Download ${photo.imageName} from ${photo.originalUrl}`);
        
        // 2. TODO: Validate file type and size using file-type and buffer length
        //    Example: const type = await fileTypeFromBuffer(imageBuffer);
        //    if (!type || type.mime !== 'image/jpeg') throw new Error('Invalid file type');
        console.log(`[API /api/process-photos] TODO: Validate file type and size for ${photo.imageName}`);
        await photoDocRef.update({ progress: 25 });


        // 3. TODO: Optimize with Sharp: WebP, EXIF removal, resolutions (800x800, 300x300, 150x150)
        //    Example: const optimizedBuffer = await sharp(imageBuffer).webp().resize(800, 800).toBuffer();
        console.log(`[API /api/process-photos] TODO: Optimize image ${photo.imageName} with Sharp`);
        await photoDocRef.update({ progress: 50 });

        // 4. TODO: Generate SEO names using 'natural' library and templates
        //    Example: const seoName = generateSeoName(photo.imageName, ...);
        console.log(`[API /api/process-photos] TODO: Generate SEO name for ${photo.imageName}`);
        await photoDocRef.update({ progress: 60 });

        // 5. TODO: Generate SEO metadata (Alt, title, description, caption) using 'natural' and templates
        console.log(`[API /api/process-photos] TODO: Generate SEO metadata for ${photo.imageName}`);
        await photoDocRef.update({ progress: 75 });

        // 6. TODO: Upload processed images (main, thumbnails) back to a new location in Firebase Storage
        //    Example: const processedUrl = await uploadToStorage(optimizedBuffer, `processed/${batchId}/${seoName}`);
        console.log(`[API /api/process-photos] TODO: Upload processed versions of ${photo.imageName} to Storage`);
        await photoDocRef.update({ progress: 90 });
        
        // 7. TODO: Update Firestore with processed image URLs, SEO data, and final status 'completed_image'
        //    await photoDocRef.update({ status: 'completed_image', processedUrl, seoName, seoMeta, progress: 100, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[API /api/process-photos] TODO: Update Firestore with final details for ${photo.imageName}`);
        
        // SIMULATED COMPLETION FOR NOW
        await photoDocRef.update({ status: 'completed_image_pending_woocommerce', progress: 100, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[API /api/process-photos] Simulated completion for ${photo.imageName}. Status 'completed_image_pending_woocommerce'`);

      } catch (imageError) {
        console.error(`[API /api/process-photos] Error processing ${photo.imageName}:`, imageError);
        await photoDocRef.update({ 
          status: 'error_processing_image', 
          errorMessage: imageError instanceof Error ? imageError.message : String(imageError),
          progress: 0, // Reset progress or set to a specific error progress
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
        });
      }
    }
    
    // TODO: After all images in the batch are processed (or attempted),
    // update overall batch status or trigger next step (e.g., WooCommerce product creation).
    // This might involve checking if all documents in 'processing_status' for this batchId are 'completed_image_pending_woocommerce' or 'error_processing_image'.

    return NextResponse.json({ 
      message: `Backend processing for batch ${batchId} acknowledged. Found ${photosData.length} photos. Check server logs for detailed (simulated) processing steps.`,
      batchId: batchId,
      filesToProcessCount: photosData.length,
      processedFiles: photosData.map(p => p.imageName) // This list is of files *found*, not yet fully processed.
    });

  } catch (error) {
    console.error('[API /api/process-photos] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to process request', details: errorMessage }, { status: 500 });
  }
}

// Helper function placeholder for downloading image (implement later)
// async function downloadImage(url: string): Promise<Buffer> {
//   const response = await fetch(url);
//   if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);
//   const arrayBuffer = await response.arrayBuffer();
//   return Buffer.from(arrayBuffer);
// }

// Helper function placeholder for uploading to storage (implement later)
// async function uploadToStorage(buffer: Buffer, destinationPath: string): Promise<string> {
//   const file = adminStorage.bucket().file(destinationPath);
//   await file.save(buffer);
//   return file.publicUrl(); // Or getSignedUrl for temporary access
// }
