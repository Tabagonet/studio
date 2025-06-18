
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, ProductAttribute } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION, PRODUCT_CATEGORIES } from '@/lib/constants';
import fs from 'fs/promises';
import path from 'path';
import {
  MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS,
  ALLOWED_MIME_TYPES_PROCESS_PHOTOS,
  LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE,
} from '@/lib/local-storage-constants';
import { wooApi } from '@/lib/woocommerce'; // Import WooCommerce API client

async function readImageFromLocalPath(localRelativePath: string): Promise<Buffer> {
  const absolutePath = path.join(process.cwd(), 'public', localRelativePath);
  try {
    const buffer = await fs.readFile(absolutePath);
    return buffer;
  } catch (error) {
    console.error(`Error reading file from ${absolutePath}:`, error);
    throw new Error(`Failed to read image from local path ${localRelativePath}. Status: ${(error as Error).message}`);
  }
}

async function writeBufferToLocalPath(
  buffer: Buffer,
  batchId: string,
  userId: string,
  seoName: string
): Promise<{ relativePath: string; absolutePath: string }> {
  const processedUploadDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
  await fs.mkdir(processedUploadDir, { recursive: true });
  
  const absolutePath = path.join(processedUploadDir, seoName);
  const relativePath = path.join('/', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId, seoName).replace(/\\\\/g, '/');

  try {
    await fs.writeFile(absolutePath, buffer);
    return { relativePath, absolutePath };
  } catch (error) {
    console.error(`Error writing file to ${absolutePath}:`, error);
    throw new Error(`Failed to write processed image to local path. Status: ${(error as Error).message}`);
  }
}


function cleanTextForFilename(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-') 
    .replace(/[^a-z0-9-]/g, '') 
    .replace(/-+/g, '-') 
    .replace(/^-+|-+$/g, ''); 
}

function applyTemplate(templateContent: string, data: { nombre_producto: string; categoria?: string; sku?:string }): string {
  let result = templateContent;
  result = result.replace(/\{\{nombre_producto\}\}/g, data.nombre_producto);
  if (data.categoria) {
    result = result.replace(/\{\{categoria\}\}/g, data.categoria);
  }
  if (data.sku) {
    result = result.replace(/\{\{sku\}\}/g, data.sku);
  }
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
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[]
): string {
  const nameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  const baseProductName = productContext?.name || nameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
  
  const templateData = {
      nombre_producto: baseProductName,
      categoria: productContext?.category ? (PRODUCT_CATEGORIES.find(c=>c.value === productContext.category)?.label || productContext.category) : '',
      sku: productContext?.sku || ''
  };

  let seoNameTemplate = templates.find(t => 
      t.type === 'nombre_seo' && 
      t.scope === 'categoria_especifica' && 
      t.categoryValue === productContext?.category
  );
  if (!seoNameTemplate) {
    seoNameTemplate = templates.find(t => t.type === 'nombre_seo' && t.scope === 'global');
  }

  let baseSeoName: string;
  if (seoNameTemplate) {
    baseSeoName = applyTemplate(seoNameTemplate.content, templateData);
  } else {
    baseSeoName = baseProductName; 
  }

  let seoName = cleanTextForFilename(baseSeoName);
  if (!seoName) { 
    seoName = cleanTextForFilename(nameWithoutExtension) || `image-${Date.now()}`;
  }
  return `${seoName}.webp`;
}

function generateSeoMetadataWithTemplate(
  generatedSeoName: string, 
  originalProductName: string, // This is derived from image name, not productContext.name
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[]
): { alt: string; title: string; description?: string; caption?: string } {
  
  const templateBaseName = productContext?.name || originalProductName;
  const templateData = {
      nombre_producto: templateBaseName,
      categoria: productContext?.category ? (PRODUCT_CATEGORIES.find(c=>c.value === productContext.category)?.label || productContext.category) : '',
      sku: productContext?.sku || ''
  };

  let metaTemplate = templates.find(t => 
      t.type === 'metadatos_seo' && 
      t.scope === 'categoria_especifica' && 
      t.categoryValue === productContext?.category
  );
  if(!metaTemplate){
      metaTemplate = templates.find(t => t.type === 'metadatos_seo' && t.scope === 'global');
  }
  if (!metaTemplate) { // Fallback to short description template
    metaTemplate = templates.find(t => 
        t.type === 'descripcion_corta' && 
        t.scope === 'categoria_especifica' && 
        t.categoryValue === productContext?.category
    );
    if(!metaTemplate){
        metaTemplate = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'global');
    }
  }

  let altText: string;
  let titleText: string;

  if (metaTemplate) {
    const fullMetaText = applyTemplate(metaTemplate.content, templateData);
    // Simple split if template generates both title and alt, e.g. "Title | Alt"
    // For now, let's assume the template is primarily for alt/title.
    altText = fullMetaText.length > 125 ? fullMetaText.substring(0, 122) + "..." : fullMetaText;
    titleText = altText; // Often the same for simplicity
  } else {
    const productNameFromSeoFile = generatedSeoName.substring(0, generatedSeoName.lastIndexOf('.webp'))
                                    .replace(/-/g, ' ')
                                    .split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
    altText = `Imagen de ${productNameFromSeoFile || templateBaseName}`;
    titleText = altText;
  }
  
  return { alt: altText, title: titleText };
}


function applyAutomationRules(
  imageNameWithoutExtension: string, // Used as primary keyword source
  productContext: WizardProductContext | undefined,
  rules: AutomationRule[]
): { assignedCategory?: string; assignedTags: string[] } {
  let categoryToAssign: string | undefined = productContext?.category; // Default to product context
  const tagsToAssign = new Set<string>(productContext?.keywords?.split(',').map(k => k.trim()).filter(k => k) || []);

  // Use product name from context if available, otherwise derive from image name
  const searchableProductName = (productContext?.name || imageNameWithoutExtension).toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  rules.forEach(rule => {
    if (rule.keyword && searchableProductName.includes(rule.keyword.toLowerCase())) {
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssign = rule.categoryToAssign; // Rule overrides context or default
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

async function createBatchCompletionNotification(batchId: string, userId: string, isWizard: boolean) {
  try {
    const batchStatusSnapshot = await adminDb.collection('processing_status')
                                        .where('batchId', '==', batchId)
                                        .get();
    
    let totalCount = 0;
    let successCount = 0; // image processing success
    let wooSuccessCount = 0;
    let errorCount = 0;

    batchStatusSnapshot.forEach(doc => {
      const data = doc.data() as ProcessingStatusEntry;
      totalCount++;
      if (data.status === 'completed_image_pending_woocommerce') successCount++;
      if (data.status === 'completed_woocommerce_integration') wooSuccessCount++;
      if (data.status.startsWith('error')) errorCount++;
    });

    if (totalCount === 0) return;

    const title = isWizard ? `Procesamiento del Producto (Asistente) ${batchId} Finalizado` : `Procesamiento del Lote ${batchId} Finalizado`;
    let description: string;
    if (isWizard) {
        description = wooSuccessCount > 0 
            ? `Producto creado/actualizado en WooCommerce. ${successCount} imágenes procesadas.`
            : `Procesamiento de imágenes completo (${successCount} imágenes). Hubo un error al integrar con WooCommerce.`;
        if(errorCount > 0) description += ` ${errorCount} imágenes con errores de procesamiento.`;
    } else {
        description = `${successCount} de ${totalCount} imágenes procesadas exitosamente. ${errorCount > 0 ? `${errorCount} con errores.` : ''}`;
    }
    
    const type: AppNotification['type'] = errorCount > 0 || (isWizard && wooSuccessCount === 0 && successCount > 0)
        ? (successCount > 0 || wooSuccessCount > 0 ? 'warning' : 'error') 
        : 'success';

    const notificationData: Omit<AppNotification, 'id'> = {
      userId: userId,
      title,
      description,
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp() as admin.firestore.Timestamp,
      isRead: false,
      linkTo: `/batch?batchId=${batchId}` // Keep link to batch page
    };

    await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add(notificationData);
    console.log(`[API /api/process-photos] Notification created for batch ${batchId}`);

  } catch (error) {
    console.error(`[API /api/process-photos] Error creating notification for batch ${batchId}:`, error);
  }
}


async function triggerNextPhotoProcessing(batchId: string, requestUrl: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API /api/process-photos] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}`);
  
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId }),
  }).catch(error => {
    console.error(`[API /api/process-photos] Error self-triggering for batch ${batchId}:`, error);
  });
}

// WooCommerce Product Creation Logic
async function createOrUpdateWooCommerceProduct(batchId: string, userId: string, productEntries: ProcessingStatusEntry[]) {
  if (!wooApi) {
    console.warn("[WooCommerce] API client not initialized. Skipping product creation.");
    await updateFirestoreStatusForBatch(batchId, 'error_woocommerce_integration', "WooCommerce API client not initialized.");
    return;
  }
  if (productEntries.length === 0) {
    console.log("[WooCommerce] No product entries to process for WooCommerce.");
    return;
  }

  const primaryEntry = productEntries.find(e => e.productContext?.isPrimary) || productEntries[0];
  const productContext = primaryEntry.productContext;

  if (!productContext) {
    console.log(`[WooCommerce] No productContext found for batch ${batchId}. Skipping WooCommerce product creation for this batch.`);
    // For non-wizard batches, we might decide to skip or handle differently. For now, skip.
    await updateFirestoreStatusForBatch(batchId, 'completed_image_pending_woocommerce', "Skipped WooCommerce: No product context (likely a non-wizard batch).");
    return;
  }

  // Check if product already created for this batchId to prevent duplicates
  const existingProductSnapshot = await adminDb.collection('processing_status')
                                       .where('batchId', '==', batchId)
                                       .where('productAssociationId', '!=', null)
                                       .limit(1)
                                       .get();
  if (!existingProductSnapshot.empty) {
    const existingProductId = existingProductSnapshot.docs[0].data().productAssociationId;
    console.log(`[WooCommerce] Product ${existingProductId} already created for batch ${batchId}. Skipping creation.`);
    await updateFirestoreStatusForBatch(batchId, 'completed_woocommerce_integration', `Product already exists: ${existingProductId}`, existingProductId);
    return;
  }
  
  console.log(`[WooCommerce] Attempting to create product for batch ${batchId}`);

  const imageDetailsForDescription = productEntries.map(entry => 
    `- ${entry.seoName || entry.imageName}: (ruta local: public${entry.processedImageDownloadUrl})`
  ).join('\\n');
  
  const productDescription = `${productContext.longDescription || `Producto: ${productContext.name}.`} \n\nImágenes Procesadas:\n${imageDetailsForDescription}`;
  
  const wooProductData: any = {
    name: productContext.name,
    type: productContext.productType || 'simple',
    sku: productContext.sku || '',
    regular_price: productContext.regularPrice,
    description: productDescription,
    short_description: productContext.shortDescription || `Breve descripción de ${productContext.name}`,
    categories: productContext.category ? [{ name: productContext.category }] : (primaryEntry.assignedCategory ? [{name: primaryEntry.assignedCategory}] : []),
    tags: primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [],
    // Images will be handled by listing paths in description for now
    images: [], // Placeholder for actual image objects if direct upload was implemented
    meta_data: [
        { key: '_local_image_paths', value: productEntries.map(e => `public${e.processedImageDownloadUrl}`) }
    ]
  };

  if (productContext.salePrice) {
    wooProductData.sale_price = productContext.salePrice;
  }

  if (productContext.attributes && productContext.attributes.length > 0 && productContext.attributes.some(attr => attr.name && attr.value)) {
    wooProductData.attributes = productContext.attributes
        .filter(attr => attr.name && attr.value) // Ensure attributes have name and value
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()),
            position: index,
            visible: true,
            variation: productContext.productType === 'variable' // Mark as variation attribute if product is variable
        }));
  }


  try {
    console.log("[WooCommerce] Product data to send:", JSON.stringify(wooProductData, null, 2));
    const response = await wooApi.post("products", wooProductData);
    const wooProductId = response.data.id;
    console.log(`[WooCommerce] Product ${wooProductId} created successfully for batch ${batchId}.`);
    await updateFirestoreStatusForBatch(batchId, 'completed_woocommerce_integration', `Product created: ${wooProductId}`, wooProductId);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Unknown WooCommerce API error";
    console.error(`[WooCommerce] Error creating product for batch ${batchId}:`, errorMessage, error.response?.data || error);
    await updateFirestoreStatusForBatch(batchId, 'error_woocommerce_integration', `WooCommerce Error: ${errorMessage}`);
    // Create a specific error notification for WooCommerce failure
    await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
        userId,
        title: `Error al crear producto en WooCommerce (Lote: ${batchId})`,
        description: `Detalles: ${errorMessage.substring(0, 200)}`,
        type: 'error',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        isRead: false,
        linkTo: `/batch?batchId=${batchId}`
    } as Omit<AppNotification, 'id'>);
  }
}

async function updateFirestoreStatusForBatch(batchId: string, status: ProcessingStatusEntry['status'], message?: string, wooProductId?: number | string) {
  const batchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
  const firestoreBatch = adminDb.batch();
  batchEntriesSnapshot.forEach(doc => {
    const updateData: any = { 
        status: status, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
    };
    if (message) updateData.lastMessage = message; // Using a new field for general messages
    if (status.startsWith('error') && message) updateData.errorMessage = message;
    if (wooProductId) updateData.productAssociationId = String(wooProductId);
    if (status === 'completed_woocommerce_integration' || status.startsWith('error_woocommerce')) {
        updateData.progress = 100; // Mark as 100% if it's a final WooCommerce step
    }
    firestoreBatch.update(doc.ref, updateData);
  });
  await firestoreBatch.commit();
  console.log(`[Firestore] Updated status for batch ${batchId} to ${status}.`);
}


export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}`);

    if (!adminDb) {
      console.error(`[API /api/process-photos] Firebase Admin SDK (Firestore) not initialized.`);
      return NextResponse.json({ error: `Server configuration error, Firebase Admin (Firestore) not available.` }, { status: 500 });
    }

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();

    if (photosToProcessSnapshot.empty) {
      // No more 'uploaded' photos, check if all are done with image processing to potentially trigger WooCommerce
      const allBatchEntriesSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .get();
      
      if (allBatchEntriesSnapshot.empty) {
        return NextResponse.json({ message: `Batch ${batchId} has no entries.`, batchId: batchId, status: 'batch_empty' }, { status: 200 });
      }

      const allEntries = allBatchEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      const isWizardFlow = allEntries.some(e => e.productContext);
      const userIdForNotification = allEntries[0]?.userId || 'temp_user_id';

      const allImageProcessingDone = allEntries.every(
        e => e.status === 'completed_image_pending_woocommerce' || e.status.startsWith('error_processing_image') || e.status === 'completed_woocommerce_integration' || e.status === 'error_woocommerce_integration'
      );
      
      const needsWooCommerceProcessing = allEntries.some(e => e.status === 'completed_image_pending_woocommerce');

      if (allImageProcessingDone && needsWooCommerceProcessing && isWizardFlow) {
          console.log(`[API /api/process-photos] All images processed for wizard batch ${batchId}. Attempting WooCommerce creation.`);
          await createOrUpdateWooCommerceProduct(batchId, userIdForNotification, allEntries.filter(e => e.status === 'completed_image_pending_woocommerce' || e.status === 'completed_woocommerce_integration'));
          // After attempting WC, create completion notification
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          return NextResponse.json({ message: `Batch ${batchId} image processing complete. WooCommerce integration attempted.`, batchId: batchId, status: 'batch_woocommerce_triggered' }, { status: 200 });
      } else if (allImageProcessingDone && !needsWooCommerceProcessing) {
          console.log(`[API /api/process-photos] Batch ${batchId} fully complete (image processing and/or WooCommerce). Creating final notification.`);
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          return NextResponse.json({ message: `Batch ${batchId} processing fully complete.`, batchId: batchId, status: 'batch_completed_final' }, { status: 200 });
      } else {
          // Still some images in intermediate processing states or batch flow not ready for WC
          console.log(`[API /api/process-photos] No 'uploaded' photos for batch ${batchId}, but some are still processing or not ready for WC.`);
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, but some are still processing or it's a non-wizard batch not yet configured for WC.`, batchId: batchId, status: 'batch_in_progress_images' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
    const userId = photoData.userId || 'temp_user_id'; 

    console.log(`[API /api/process-photos] Starting processing for: ${photoData.imageName} (Doc ID: ${photoData.id}) in batch ${batchId}`);
    
    const templates = await getTemplates(); 
    const automationRules = await getAutomationRules();

    try {
      await photoDocRef.update({ 
        status: 'processing_image_started', 
        progress: 5, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      if (!photoData.originalDownloadUrl) {
          throw new Error(`Missing originalDownloadUrl (local path) for ${photoData.imageName}`);
      }
      console.log(`[API /api/process-photos] Reading local image ${photoData.imageName} from ${photoData.originalDownloadUrl}`);
      const imageBuffer = await readImageFromLocalPath(photoData.originalDownloadUrl as string);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      if (imageBuffer.length > MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS) {
          throw new Error(`File ${photoData.imageName} exceeds max size of ${MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES_PROCESS_PHOTOS.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photoData.imageName}: ${type?.mime || 'unknown'}. Expected JPG.`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) 
                                      .toBuffer();
      await photoDocRef.update({ progress: 45, status: 'processing_image_optimized', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      const imageNameWithoutExtension = (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')) || (photoData.imageName as string);
      // Pass productContext to template functions
      const generatedSeoName = generateSeoFilenameWithTemplate(photoData.imageName as string, photoData.productContext, templates);
      await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const originalProductNameForMeta = imageNameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
      const seoMetadata = generateSeoMetadataWithTemplate(generatedSeoName, originalProductNameForMeta, photoData.productContext, templates);
      await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      const { assignedCategory, assignedTags } = applyAutomationRules(imageNameWithoutExtension, photoData.productContext, automationRules);
      await photoDocRef.update({
        progress: 75,
        assignedCategory: assignedCategory || (photoData.productContext?.category || null), 
        assignedTags: assignedTags.length > 0 ? assignedTags : (photoData.productContext?.keywords?.split(',').map(k=>k.trim()).filter(k=>k) || []),
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const { relativePath: processedImageRelativePath } = await writeBufferToLocalPath(
        processedImageBuffer,
        batchId,
        userId,
        generatedSeoName
      );
      await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded', processedImageDownloadUrl: processedImageRelativePath, processedImageStoragePath: processedImageRelativePath, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      
      await photoDocRef.update({ 
          status: 'completed_image_pending_woocommerce', 
          progress: 100, 
          updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });
      console.log(`[API /api/process-photos] Successfully processed ${photoData.imageName}. Status 'completed_image_pending_woocommerce'`);

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

    // After processing an image, always trigger the next step, 
    // which might be another image or the WooCommerce/completion check.
    await triggerNextPhotoProcessing(batchId, request.url); 
    return NextResponse.json({ 
      message: `Triggered next step for batch ${batchId} after processing ${photoData.imageName}.`,
      batchId: batchId,
      processedPhotoId: photoData.id,
      status: 'triggered_next_process' 
    });

  } catch (error) {
    console.error('[API /api/process-photos] General Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Failed to process request', details: errorMessage, status: 'error_general' }, { status: 500 });
  }
}

