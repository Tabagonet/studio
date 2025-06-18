
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin'; // Removed adminStorage
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION } from '@/lib/constants';
import fs from 'fs/promises';
import path from 'path';
import {
  MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS,
  ALLOWED_MIME_TYPES_PROCESS_PHOTOS,
  LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE,
} from '@/lib/local-storage-constants'; // Create this file

async function readImageFromLocalPath(localRelativePath: string): Promise<Buffer> {
  // localRelativePath is like /user_uploads/raw/batch_123/image.jpg
  // It needs to be converted to an absolute path from the project root's public folder
  const absolutePath = path.join(process.cwd(), 'public', localRelativePath);
  try {
    const buffer = await fs.readFile(absolutePath);
    return buffer;
  } catch (error) {
    console.error(\`Error reading file from \${absolutePath}:\`, error);
    throw new Error(\`Failed to read image from local path \${localRelativePath}. Status: \${(error as Error).message}\`);
  }
}

async function writeBufferToLocalPath(
  buffer: Buffer,
  batchId: string,
  userId: string, // For potential future sub-folder structuring
  seoName: string // e.g., image-seo-name.webp
): Promise<{ relativePath: string; absolutePath: string }> {
  const processedUploadDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
  await fs.mkdir(processedUploadDir, { recursive: true });
  
  const absolutePath = path.join(processedUploadDir, seoName);
  const relativePath = path.join('/', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId, seoName).replace(/\\\\/g, '/');

  try {
    await fs.writeFile(absolutePath, buffer);
    return { relativePath, absolutePath };
  } catch (error) {
    console.error(\`Error writing file to \${absolutePath}:\`, error);
    throw new Error(\`Failed to write processed image to local path. Status: \${(error as Error).message}\`);
  }
}


function cleanTextForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/\\s+/g, '-') 
    .replace(/[^a-z0-9-]/g, '') 
    .replace(/-+/g, '-') 
    .replace(/^-+|-+$/g, ''); 
}

function applyTemplate(templateContent: string, data: { nombre_producto: string }): string {
  let result = templateContent;
  result = result.replace(/\\{\\{nombre_producto\\}\\}/g, data.nombre_producto);
  return result;
}

async function getTemplates(): Promise<ProductTemplate[]> {
  const templatesSnapshot = await adminDb.collection(PRODUCT_TEMPLATES_COLLECTION).get();
  const fetchedTemplates: ProductTemplate[] = [];
  templatesSnapshot.forEach(doc => {
    fetchedTemplates.push({ id: doc.id, ...doc.data() } as ProductTemplate);
  });
  return fetchedTemplates;
}

async function getAutomationRules(): Promise<AutomationRule[]> {
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
  const cleanedProductNameForTemplate = nameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');

  const seoNameTemplate = templates.find(t => t.type === 'nombre_seo' && t.scope === 'global');

  let baseSeoName: string;
  if (seoNameTemplate) {
    baseSeoName = applyTemplate(seoNameTemplate.content, { nombre_producto: cleanedProductNameForTemplate });
  } else {
    baseSeoName = cleanedProductNameForTemplate; 
  }

  let seoName = cleanTextForFilename(baseSeoName);
  if (!seoName) { 
    seoName = cleanTextForFilename(nameWithoutExtension) || \`image-\${Date.now()}\`;
  }
  return \`\${seoName}.webp\`;
}

function generateSeoMetadataWithTemplate(
  generatedSeoName: string, 
  originalProductName: string,
  templates: ProductTemplate[]
): { alt: string; title: string } {
  const metaTemplate = templates.find(t => t.type === 'metadatos_seo' && t.scope === 'global') ||
                       templates.find(t => t.type === 'descripcion_corta' && t.scope === 'global');

  let altText: string;
  if (metaTemplate) {
    altText = applyTemplate(metaTemplate.content, { nombre_producto: originalProductName });
    if (altText.length > 125) {
        altText = altText.substring(0, 122) + "...";
    }
  } else {
    const productNameFromSeoFile = generatedSeoName.substring(0, generatedSeoName.lastIndexOf('.webp'))
                                    .replace(/-/g, ' ')
                                    .split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
    altText = \`Imagen de \${productNameFromSeoFile || originalProductName}\`;
  }
  
  const title = altText;
  return { alt: altText, title: title };
}


function applyAutomationRules(
  imageNameWithoutExtension: string,
  rules: AutomationRule[]
): { assignedCategory?: string; assignedTags: string[] } {
  let categoryToAssign: string | undefined = undefined;
  const tagsToAssign = new Set<string>();
  const searchableImageName = imageNameWithoutExtension.toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  rules.forEach(rule => {
    if (rule.keyword && searchableImageName.includes(rule.keyword.toLowerCase())) {
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssign = rule.categoryToAssign;
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

async function createBatchCompletionNotification(batchId: string, userId: string) {
  try {
    const batchStatusSnapshot = await adminDb.collection('processing_status')
                                        .where('batchId', '==', batchId)
                                        .get();
    
    let totalCount = 0;
    let successCount = 0;
    let errorCount = 0;

    batchStatusSnapshot.forEach(doc => {
      const data = doc.data() as ProcessingStatusEntry;
      totalCount++;
      if (data.status === 'completed_image_pending_woocommerce' || data.status === 'completed_woocommerce_integration') {
        successCount++;
      } else if (data.status.startsWith('error')) {
        errorCount++;
      }
    });

    if (totalCount === 0) return;

    const title = \`Procesamiento del Lote \${batchId} Finalizado\`;
    const description = \`\${successCount} de \${totalCount} imágenes procesadas exitosamente. \${errorCount > 0 ? \`\${errorCount} con errores.\` : ''}\`;
    const type: AppNotification['type'] = errorCount > 0 ? (successCount > 0 ? 'warning' : 'error') : 'success';

    const notificationData: Omit<AppNotification, 'id'> = {
      userId: userId,
      title,
      description,
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
      isRead: false,
      linkTo: \`/batch?batchId=\${batchId}\`
    };

    await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add(notificationData);
    console.log(\`[API /api/process-photos] Notification created for batch \${batchId}\`);

  } catch (error) {
    console.error(\`[API /api/process-photos] Error creating notification for batch \${batchId}:\`, error);
  }
}


async function triggerNextPhotoProcessing(batchId: string, requestUrl: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(\`[API /api/process-photos] Triggering next photo processing for batch \${batchId} by calling: \${apiUrl}\`);
  
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  }).catch(error => {
    console.error(\`[API /api/process-photos] Error self-triggering for batch \${batchId}:\`, error);
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    console.log(\`[API /api/process-photos] Received request for batchId: \${batchId}\`);

    if (!adminDb ) { // Removed adminStorage check
      console.error(\`[API /api/process-photos] Firebase Admin SDK (Firestore) not initialized.\`);
      return NextResponse.json({ error: \`Server configuration error, Firebase Admin (Firestore) not available.\` }, { status: 500 });
    }

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();

    if (photosToProcessSnapshot.empty) {
      console.log(\`[API /api/process-photos] No more 'uploaded' photos found for batchId: \${batchId}.\`);
      const anyProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_rules_applied', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyProcessingSnapshot.empty) {
          console.log(\`[API /api/process-photos] Batch \${batchId} confirmed complete. Creating notification.\`);
          const firstPhotoDoc = (await adminDb.collection('processing_status').where('batchId', '==', batchId).limit(1).get()).docs[0];
          const userIdForNotification = firstPhotoDoc?.data().userId || 'temp_user_id';
          await createBatchCompletionNotification(batchId, userIdForNotification);
          return NextResponse.json({ message: \`Batch \${batchId} processing complete. No more 'uploaded' or 'processing' images found.\`, batchId: batchId, status: 'batch_completed' }, { status: 200 });
      } else {
          return NextResponse.json({ message: \`No 'uploaded' photos found for batchId: \${batchId}, but some are still processing.\`, batchId: batchId, status: 'batch_in_progress' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
    const userId = photoData.userId || 'temp_user_id'; 

    console.log(\`[API /api/process-photos] Starting processing for: \${photoData.imageName} (Doc ID: \${photoData.id}) in batch \${batchId}\`);
    
    let processedSuccessfully = false;
    const templates = await getTemplates(); 
    const automationRules = await getAutomationRules();

    try {
      await photoDocRef.update({ 
        status: 'processing_image_started', 
        progress: 5, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      if (!photoData.originalDownloadUrl) { // This is now a local relative path
          throw new Error(\`Missing originalDownloadUrl (local path) for \${photoData.imageName}\`);
      }
      console.log(\`[API /api/process-photos] Reading local image \${photoData.imageName} from \${photoData.originalDownloadUrl}\`);
      const imageBuffer = await readImageFromLocalPath(photoData.originalDownloadUrl as string);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      console.log(\`[API /api/process-photos] Validating file type and size for \${photoData.imageName}\`);
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS) {
          throw new Error(\`File \${photoData.imageName} exceeds max size of \${MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS / (1024 * 1024)}MB.\`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES_PROCESS_PHOTOS.includes(type.mime)) {
          throw new Error(\`Invalid file type for \${photoData.imageName}: \${type?.mime || 'unknown'}. Expected JPG.\`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      console.log(\`[API /api/process-photos] Optimizing image \${photoData.imageName} with Sharp\`);
      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) 
                                      .toBuffer();
      await photoDocRef.update({ progress: 45, status: 'processing_image_optimized', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      const imageNameWithoutExtension = (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')) || (photoData.imageName as string);
      const generatedSeoName = generateSeoFilenameWithTemplate(photoData.imageName as string, templates);
      console.log(\`[API /api/process-photos] Generated SEO name for \${photoData.imageName}: \${generatedSeoName}\`);
      await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const originalProductNameForTemplate = imageNameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
      const seoMetadata = generateSeoMetadataWithTemplate(generatedSeoName, originalProductNameForTemplate, templates);
      console.log(\`[API /api/process-photos] Generated SEO metadata for \${photoData.imageName}:\`, seoMetadata);
      await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      const { assignedCategory, assignedTags } = applyAutomationRules(imageNameWithoutExtension, automationRules);
      console.log(\`[API /api/process-photos] Automation rules applied for \${photoData.imageName}: Category - \${assignedCategory}, Tags - \${assignedTags.join(', ')}\`);
      await photoDocRef.update({
        progress: 75,
        assignedCategory: assignedCategory || null, 
        assignedTags: assignedTags,
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(\`[API /api/process-photos] Writing processed version of \${photoData.imageName} locally\`);
      const { relativePath: processedImageRelativePath } = await writeBufferToLocalPath(
        processedImageBuffer,
        batchId,
        userId,
        generatedSeoName
      );
      await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      await photoDocRef.update({ 
          status: 'completed_image_pending_woocommerce', 
          processedImageDownloadUrl: processedImageRelativePath, // Store local relative path
          processedImageStoragePath: processedImageRelativePath, // Store local relative path
          progress: 100, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      console.log(\`[API /api/process-photos] Successfully processed \${photoData.imageName}. Status 'completed_image_pending_woocommerce'\`);
      processedSuccessfully = true;

    } catch (imageError) {
      console.error(\`[API /api/process-photos] Error processing \${photoData.imageName} (Doc ID: \${photoData.id}):\`, imageError);
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
      console.log(\`[API /api/process-photos] More images to process for batch \${batchId}. Triggering next.\`);
      await triggerNextPhotoProcessing(batchId, request.url); 
      return NextResponse.json({ 
        message: \`Processed \${photoData.imageName} (status: \${processedSuccessfully ? 'success' : 'error'}). Triggering next photo in batch \${batchId}.\`,
        batchId: batchId,
        processedPhotoId: photoData.id,
        status: 'batch_in_progress' 
      });
    } else {
      console.log(\`[API /api/process-photos] No more 'uploaded' images after processing \${photoData.imageName} for batch \${batchId}. Checking for any still processing...\`);
      const anyStillProcessingSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .where('status', 'in', ['processing_image_started', 'processing_image_downloaded', 'processing_image_validated', 'processing_image_optimized', 'processing_image_seo_named', 'processing_image_metadata_generated', 'processing_image_rules_applied', 'processing_image_reuploaded'])
                                            .limit(1)
                                            .get();
      if (anyStillProcessingSnapshot.empty) {
          console.log(\`[API /api/process-photos] Batch \${batchId} confirmed complete. Creating notification.\`);
          await createBatchCompletionNotification(batchId, userId);
          return NextResponse.json({ 
            message: \`Processed \${photoData.imageName} (status: \${processedSuccessfully ? 'success' : 'error'}). Batch \${batchId} processing complete.\`,
            batchId: batchId,
            processedPhotoId: photoData.id,
            status: 'batch_completed'
          });
      } else {
           console.log(\`[API /api/process-photos] Batch \${batchId} has other images still in intermediate processing states.\`);
           return NextResponse.json({ 
            message: \`Processed \${photoData.imageName} (status: \${processedSuccessfully ? 'success' : 'error'}). No more 'uploaded' photos for batch \${batchId}, but some are still processing.\`,
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
