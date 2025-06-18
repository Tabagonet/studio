
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, adminStorage, admin } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION } from '@/lib/constants';

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
  await file.makePublic(); // For phase 1, direct public URL. Consider signed URLs for production.
  const downloadURL = file.publicUrl();
  return { downloadURL, storagePath: destinationPath };
}

function cleanTextForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') 
    .replace(/[^a-z0-9-]/g, '') 
    .replace(/-+/g, '-') 
    .replace(/^-+|-+$/g, ''); 
}

function applyTemplate(templateContent: string, data: { nombre_producto: string }): string {
  let result = templateContent;
  result = result.replace(/\{\{nombre_producto\}\}/g, data.nombre_producto);
  return result;
}

async function getTemplates(): Promise<ProductTemplate[]> {
  // console.log("[API /api/process-photos] Fetching templates from Firestore.");
  const templatesSnapshot = await adminDb.collection(PRODUCT_TEMPLATES_COLLECTION).get();
  const fetchedTemplates: ProductTemplate[] = [];
  templatesSnapshot.forEach(doc => {
    fetchedTemplates.push({ id: doc.id, ...doc.data() } as ProductTemplate);
  });
  return fetchedTemplates;
}

async function getAutomationRules(): Promise<AutomationRule[]> {
  // console.log("[API /api/process-photos] Fetching automation rules from Firestore.");
  const rulesSnapshot = await adminDb.collection(AUTOMATION_RULES_COLLECTION).get();
  const fetchedRules: AutomationRule[] = [];
  rulesSnapshot.forEach(doc => {
    fetchedRules.push({ id: doc.id, ...doc.data() } as AutomationRule);
  });
  return fetchedRules;
}

function generateSeoFilenameWithTemplate(
  originalName: string,
  templates: ProductTemplate[]
): string {
  const nameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const cleanedProductName = nameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');

  const seoNameTemplate = templates.find(t => t.type === 'nombre_seo' && t.scope === 'global');

  let baseSeoName: string;
  if (seoNameTemplate) {
    baseSeoName = applyTemplate(seoNameTemplate.content, { nombre_producto: cleanedProductName });
  } else {
    baseSeoName = cleanedProductName; 
  }

  let seoName = cleanTextForFilename(baseSeoName);
  if (!seoName) {
    seoName = `image-${Date.now()}`; 
  }
  return `${seoName}.webp`;
}

function generateSeoMetadataWithTemplate(
  generatedSeoName: string, 
  originalProductName: string, 
  templates: ProductTemplate[]
): { alt: string; title: string } {
  const altTextTemplate = templates.find(t => (t.type === 'metadatos_seo' || t.type === 'descripcion_corta') && t.scope === 'global');

  let altText: string;
  if (altTextTemplate) {
    altText = applyTemplate(altTextTemplate.content, { nombre_producto: originalProductName });
    if (altText.length > 125) {
        altText = altText.substring(0, 122) + "...";
    }
  } else {
    const productNameFromSeoFile = generatedSeoName.substring(0, generatedSeoName.lastIndexOf('.webp'))
                                    .replace(/-/g, ' ')
                                    .split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
    altText = `Imagen de ${productNameFromSeoFile}`;
  }
  
  const title = altText;
  return { alt: altText, title: title };
}

function applyAutomationRules(
  imageName: string, // Used as a proxy for product name for keyword matching
  rules: AutomationRule[]
): { assignedCategory?: string; assignedTags: string[] } {
  let categoryToAssign: string | undefined = undefined;
  const tagsToAssign = new Set<string>();
  const searchableImageName = imageName.toLowerCase();

  rules.forEach(rule => {
    if (rule.keyword && searchableImageName.includes(rule.keyword.toLowerCase())) {
      if (rule.categoryToAssign) {
        categoryToAssign = rule.categoryToAssign; // Last matching rule wins for category
      }
      if (rule.tagsToAssign) {
        rule.tagsToAssign.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagsToAssign.add(trimmedTag);
          }
        });
      }
    }
  });
  return { assignedCategory: categoryToAssign, assignedTags: Array.from(tagsToAssign) };
}


async function triggerNextPhotoProcessing(batchId: string, requestUrl: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API /api/process-photos] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}`);
  
  // Fire-and-forget
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

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No more 'uploaded' photos found for batchId: ${batchId}.`);
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_rules_applied', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          return NextResponse.json({ message: `Batch ${batchId} processing complete. No more 'uploaded' or 'processing' images found.`, batchId: batchId, status: 'batch_completed' }, { status: 200 });
      } else {
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, but some are still processing.`, batchId: batchId, status: 'batch_in_progress' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);

    console.log(`[API /api/process-photos] Starting processing for: ${photoData.imageName} (Doc ID: ${photoData.id}) in batch ${batchId}`);
    
    let processedSuccessfully = false;
    const templates = await getTemplates(); 
    const automationRules = await getAutomationRules();

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
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      console.log(`[API /api/process-photos] Validating file type and size for ${photoData.imageName}`);
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES) {
          throw new Error(`File ${photoData.imageName} exceeds max size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photoData.imageName}: ${type?.mime || 'unknown'}. Expected JPG.`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      console.log(`[API /api/process-photos] Optimizing image ${photoData.imageName} with Sharp`);
      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) 
                                      .toBuffer();
      await photoDocRef.update({ progress: 50, status: 'processing_image_optimized', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      const generatedSeoName = generateSeoFilenameWithTemplate(photoData.imageName as string, templates);
      console.log(`[API /api/process-photos] Generated SEO name for ${photoData.imageName}: ${generatedSeoName}`);
      await photoDocRef.update({ progress: 60, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const originalProductNameForTemplate = (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')) || (photoData.imageName as string);
      const seoMetadata = generateSeoMetadataWithTemplate(generatedSeoName, originalProductNameForTemplate.replace(/-/g, ' ').replace(/_/g, ' '), templates);
      console.log(`[API /api/process-photos] Generated SEO metadata for ${photoData.imageName}:`, seoMetadata);
      await photoDocRef.update({ progress: 70, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      // Apply Automation Rules
      const imageNameForRules = (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')) || photoData.imageName;
      const { assignedCategory, assignedTags } = applyAutomationRules(imageNameForRules, automationRules);
      console.log(`[API /api/process-photos] Automation rules applied for ${photoData.imageName}: Category - ${assignedCategory}, Tags - ${assignedTags.join(', ')}`);
      await photoDocRef.update({
        progress: 80,
        assignedCategory: assignedCategory || null, // Store null if undefined
        assignedTags: assignedTags,
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const userId = photoData.userId || 'temp_user_id';
      const processedImageStoragePath = `processed_uploads/${userId}/${batchId}/${generatedSeoName}`;
      console.log(`[API /api/process-photos] Uploading processed version of ${photoData.imageName} to ${processedImageStoragePath}`);
      
      const { downloadURL: processedImageDownloadUrl, storagePath: finalProcessedPath } = await uploadBufferToStorage(
        processedImageBuffer,
        processedImageStoragePath,
        'image/webp'
      );
      await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
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
        progress: currentProgress > 5 ? currentProgress : 5, 
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
      console.log(`[API /api/process-photos] No more 'uploaded' images after processing ${photoData.imageName} for batch ${batchId}. Checking for any still processing...`);
      const anyStillProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_rules_applied', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyStillProcessingSnapshot.empty) {
          console.log(`[API /api/process-photos] Batch ${batchId} confirmed complete.`);
          return NextResponse.json({ 
            message: `Processed ${photoData.imageName} (status: ${processedSuccessfully ? 'success' : 'error'}). Batch ${batchId} processing complete.`,
            batchId: batchId,
            processedPhotoId: photoData.id,
            status: 'batch_completed'
          });
      } else {
           console.log(`[API /api/process-photos] Batch ${batchId} has other images still in intermediate processing states.`);
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
    

    
