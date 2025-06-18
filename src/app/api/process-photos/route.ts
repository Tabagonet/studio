
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION } from '@/lib/constants';
import fs from 'fs/promises';
import path from 'path';
import {
  MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS,
  ALLOWED_MIME_TYPES_PROCESS_PHOTOS,
  LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE,
} from '@/lib/local-storage-constants';
import { wooApi } from '@/lib/woocommerce';

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
  if (!text) return `imagen-desconocida-${Date.now()}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '-') 
    .replace(/[^a-z0-9-]/g, '') 
    .replace(/-+/g, '-') 
    .replace(/^-+|-+$/g, ''); 
}


function applyTemplate(templateContent: string, data: { nombre_producto?: string | null; categoria_slug?: string | null; sku?:string | null }): string {
  let result = templateContent;
  result = result.replace(/\{\{nombre_producto\}\}/g, data.nombre_producto || '');
  result = result.replace(/\{\{categoria\}\}/g, data.categoria_slug || '');
  result = result.replace(/\{\{sku\}\}/g, data.sku || '');
  result = result.replace(/\{\{[^}]+\}\}/g, ''); 
  return result.trim();
}

async function getTemplates(): Promise<ProductTemplate[]> {
  if (!adminDb) {
    console.error("[API /api/process-photos] Firestore (adminDb) is not initialized in getTemplates.");
    throw new Error("Server configuration error: Firestore not available for templates.");
  }
  const templatesSnapshot = await adminDb.collection(PRODUCT_TEMPLATES_COLLECTION).get();
  const fetchedTemplates: ProductTemplate[] = [];
  templatesSnapshot.forEach(doc => {
    fetchedTemplates.push({ id: doc.id, ...doc.data() } as ProductTemplate);
  });
  return fetchedTemplates;
}

async function getAutomationRules(): Promise<AutomationRule[]> {
  if (!adminDb) {
    console.error("[API /api/process-photos] Firestore (adminDb) is not initialized in getAutomationRules.");
    throw new Error("Server configuration error: Firestore not available for rules.");
  }
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
  const baseProductNameFromContext = productContext?.name || nameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');

  const templateData = {
      nombre_producto: baseProductNameFromContext,
      categoria_slug: productContext?.category,
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

  let baseForCleaning: string;
  if (seoNameTemplate) {
      const templatedName = applyTemplate(seoNameTemplate.content, templateData);
      if (templatedName === baseProductNameFromContext || !templatedName.trim() || templatedName.includes("{{")) {
          baseForCleaning = nameWithoutExtension;
      } else {
          baseForCleaning = templatedName;
      }
  } else {
      baseForCleaning = nameWithoutExtension;
  }

  let finalSeoName = cleanTextForFilename(baseForCleaning);
  if (!finalSeoName) { 
      finalSeoName = cleanTextForFilename(nameWithoutExtension) || `imagen-${Date.now()}`;
  }
  return `${finalSeoName}.webp`;
}

function generateSeoMetadataWithTemplate(
  generatedSeoName: string,
  originalProductName: string,
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[]
): { alt: string; title: string; description?: string; caption?: string } {

  const templateBaseName = productContext?.name || originalProductName;
  const templateData = {
      nombre_producto: templateBaseName,
      categoria_slug: productContext?.category,
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
  
  if (!metaTemplate) {
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
    if (metaTemplate.type === 'metadatos_seo' || metaTemplate.type === 'descripcion_corta') {
        altText = fullMetaText.length > 125 ? fullMetaText.substring(0, 122) + "..." : fullMetaText;
    } else { 
        altText = `Imagen de ${templateBaseName}`;
    }
    titleText = altText; 
  } else {
    const productNameFromSeoFile = generatedSeoName.substring(0, generatedSeoName.lastIndexOf('.webp'))
                                    .replace(/-/g, ' ')
                                    .split(' ')
                                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                                    .join(' ');
    altText = `Imagen de ${productNameFromSeoFile || templateBaseName}`;
    titleText = altText;
  }

  return { alt: altText || `Imagen de ${templateBaseName}`, title: titleText || `Imagen de ${templateBaseName}` };
}


function applyAutomationRules(
  imageNameWithoutExtension: string,
  productContext: WizardProductContext | undefined,
  rules: AutomationRule[]
): { assignedCategorySlug?: string; assignedTags: string[] } {
  let categoryToAssignSlug: string | undefined = productContext?.category;
  const tagsToAssign = new Set<string>(productContext?.keywords?.split(',').map(k => k.trim()).filter(k => k) || []);

  const searchableProductName = (productContext?.name || imageNameWithoutExtension).toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  rules.forEach(rule => {
    if (rule.keyword && searchableProductName.includes(rule.keyword.toLowerCase())) {
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssignSlug = rule.categoryToAssign;
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
  return { assignedCategorySlug: categoryToAssignSlug, assignedTags: Array.from(tagsToAssign) };
}

async function createBatchCompletionNotification(batchId: string, userId: string, isWizard: boolean) {
  if (!adminDb) {
    console.error("[API /api/process-photos] Firestore (adminDb) is not initialized in createBatchCompletionNotification.");
    return; 
  }
  try {
    const batchStatusSnapshot = await adminDb.collection('processing_status')
                                        .where('batchId', '==', batchId)
                                        .get();

    let totalCount = 0;
    let successCount = 0;
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
            ? `Producto creado/actualizado en WooCommerce. ${successCount + wooSuccessCount} imágenes procesadas.`
            : `Procesamiento de imágenes completo (${successCount} imágenes). Hubo un error al integrar con WooCommerce.`;
        if(errorCount > 0) description += ` ${errorCount} imágenes con errores de procesamiento.`;
    } else {
        description = `${successCount + wooSuccessCount} de ${totalCount} imágenes procesadas exitosamente. ${errorCount > 0 ? `${errorCount} con errores.` : ''}`;
    }

    const type: AppNotification['type'] = errorCount > 0 || (isWizard && wooSuccessCount === 0 && successCount > 0)
        ? ((successCount > 0 || wooSuccessCount > 0) ? 'warning' : 'error')
        : 'success';

    const notificationData: Omit<AppNotification, 'id'> = {
      userId: userId,
      title,
      description,
      type,
      timestamp: admin.firestore.FieldValue.serverTimestamp() as any, // Corrected cast
      isRead: false,
      linkTo: `/batch?batchId=${batchId}`
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

async function createOrUpdateWooCommerceProduct(
    batchId: string, 
    userId: string, 
    productEntries: ProcessingStatusEntry[],
    templates: ProductTemplate[],
    appBaseUrl: string
) {
  if (!adminDb) {
    console.error("[WooCommerce] Firestore (adminDb) is not initialized in createOrUpdateWooCommerceProduct.");
    await updateFirestoreStatusForBatch(batchId, 'error_woocommerce_integration', "Server configuration error: Firestore not available.");
    return;
  }
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
    await updateFirestoreStatusForBatch(batchId, 'completed_image_pending_woocommerce', "Skipped WooCommerce: No product context.");
    return;
  }

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
  
  const templateDataForDesc = {
      nombre_producto: productContext.name,
      categoria_slug: productContext.category,
      sku: productContext.sku || ''
  };

  let shortDescTemplateGlobal = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'global');
  let shortDescTemplateCategory = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'categoria_especifica' && t.categoryValue === productContext.category);
  const finalShortDescTemplate = shortDescTemplateCategory || shortDescTemplateGlobal;

  let longDescTemplateGlobal = templates.find(t => t.type === 'descripcion_larga' && t.scope === 'global');
  let longDescTemplateCategory = templates.find(t => t.type === 'descripcion_larga' && t.scope === 'categoria_especifica' && t.categoryValue === productContext.category);
  const finalLongDescTemplate = longDescTemplateCategory || longDescTemplateGlobal;

  const generatedShortDescription = finalShortDescTemplate
      ? applyTemplate(finalShortDescTemplate.content, templateDataForDesc)
      : productContext.shortDescription || `Breve descripción de ${productContext.name}`;

  const baseLongDescription = finalLongDescTemplate
      ? applyTemplate(finalLongDescTemplate.content, templateDataForDesc)
      : productContext.longDescription || `Producto: ${productContext.name}.`;
  
  const imageDetailsForDescription = productEntries
    .map(entry => `- ${entry.seoName || entry.imageName}: (ruta local: public${entry.processedImageDownloadUrl})`)
    .join('\n');

  const finalProductDescription = `${baseLongDescription}\n\nImágenes Procesadas:\n${imageDetailsForDescription}`;

  const wooImages = productEntries
    .filter(entry => entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce' && entry.seoMetadata)
    .map((entry, index) => ({
      src: `${appBaseUrl}${entry.processedImageDownloadUrl?.startsWith('/') ? entry.processedImageDownloadUrl : '/' + entry.processedImageDownloadUrl}`,
      name: entry.seoName || entry.imageName || `Imagen de ${productContext.name}`,
      alt: entry.seoMetadata?.alt || entry.seoName || `Imagen de ${productContext.name}`,
      position: entry.productContext?.isPrimary ? 0 : index + 1 
    }))
    .sort((a, b) => a.position - b.position);

  // Ensure primary image is first and positions are sequential
  const primaryImageIndex = wooImages.findIndex(img => img.position === 0);
  if (primaryImageIndex > 0) { // if primary is found and not already at index 0
      const primaryImage = wooImages.splice(primaryImageIndex, 1)[0];
      wooImages.unshift(primaryImage); // put it at the beginning
  }
  wooImages.forEach((img, idx) => img.position = idx); // re-assign sequential positions


  const wooCategories: { slug?: string; name?: string; id?: number }[] = [];
  if (productContext.category) {
    wooCategories.push({ slug: productContext.category });
  } else if (primaryEntry.assignedCategorySlug) {
    wooCategories.push({ slug: primaryEntry.assignedCategorySlug });
  }


  const wooProductData: any = {
    name: productContext.name,
    type: productContext.productType || 'simple',
    sku: productContext.sku || '',
    regular_price: productContext.regularPrice,
    description: finalProductDescription,
    short_description: generatedShortDescription,
    categories: wooCategories.length > 0 ? wooCategories.map(c => ({slug: c.slug})) : [], // Ensure it's an array of objects with slug
    tags: primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [],
    images: wooImages,
    meta_data: [
        { key: '_local_image_paths', value: productEntries.map(e => `public${e.processedImageDownloadUrl}`) }
    ]
  };

  if (productContext.salePrice) {
    wooProductData.sale_price = productContext.salePrice;
  }

  if (productContext.attributes && productContext.attributes.length > 0 && productContext.attributes.some(attr => attr.name && attr.value)) {
    wooProductData.attributes = productContext.attributes
        .filter(attr => attr.name && attr.value) 
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()),
            position: index,
            visible: true,
            variation: productContext.productType === 'variable'
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
    if (adminDb) {
        await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
            userId,
            title: `Error al crear producto en WooCommerce (Lote: ${batchId})`,
            description: `Detalles: ${errorMessage.substring(0, 200)}`,
            type: 'error',
            timestamp: admin.firestore.FieldValue.serverTimestamp() as any, // Corrected cast
            isRead: false,
            linkTo: `/batch?batchId=${batchId}`
        } as Omit<AppNotification, 'id'>);
    }
  }
}

async function updateFirestoreStatusForBatch(batchId: string, status: ProcessingStatusEntry['status'], message?: string, wooProductId?: number | string) {
  if (!adminDb) {
    console.error("[Firestore] adminDb is not initialized in updateFirestoreStatusForBatch. Cannot update status.");
    return;
  }
  const batchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
  const firestoreBatch = adminDb.batch();
  batchEntriesSnapshot.forEach(doc => {
    const updateData: any = {
        status: status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (message) updateData.lastMessage = message;
    if (status.startsWith('error') && message) updateData.errorMessage = message;
    if (wooProductId) updateData.productAssociationId = String(wooProductId);
    if (status === 'completed_woocommerce_integration' || status.startsWith('error_woocommerce')) {
        updateData.progress = 100;
    }
    firestoreBatch.update(doc.ref, updateData);
  });
  await firestoreBatch.commit();
  console.log(`[Firestore] Updated status for batch ${batchId} to ${status}.`);
}


export async function POST(request: NextRequest) {
  let body; // Define body here to be accessible in the final catch block
  try {
    if (!adminDb) {
      console.error("[API /api/process-photos] Firebase Admin SDK (Firestore) is not initialized. This is a server configuration issue.");
      return NextResponse.json(
        { error: 'Server configuration error: Firebase Admin SDK not initialized. Please check server logs and FIREBASE_SERVICE_ACCOUNT_JSON environment variable.' },
        { status: 500 }
      );
    }

    const currentRequestUrl = new URL(request.url);
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || `${currentRequestUrl.protocol}//${currentRequestUrl.host}`;

    body = await request.json(); // Assign to the outer scope body
    const { batchId } = body;

    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}`);

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .limit(1)
                                          .get();
    
    const templates = await getTemplates(); 
    const automationRules = await getAutomationRules(); 

    if (photosToProcessSnapshot.empty) {
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
          await createOrUpdateWooCommerceProduct(
            batchId, 
            userIdForNotification, 
            allEntries.filter(e => e.status === 'completed_image_pending_woocommerce' || e.status === 'completed_woocommerce_integration'),
            templates, 
            appBaseUrl
          );
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          return NextResponse.json({ message: `Batch ${batchId} image processing complete. WooCommerce integration attempted.`, batchId: batchId, status: 'batch_woocommerce_triggered' }, { status: 200 });
      } else if (allImageProcessingDone && !needsWooCommerceProcessing) {
          console.log(`[API /api/process-photos] Batch ${batchId} fully complete (image processing and/or WooCommerce). Creating final notification.`);
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          return NextResponse.json({ message: `Batch ${batchId} processing fully complete.`, batchId: batchId, status: 'batch_completed_final' }, { status: 200 });
      } else {
          console.log(`[API /api/process-photos] No 'uploaded' photos for batch ${batchId}, but some are still processing or not ready for WC.`);
          if(allEntries.some(e => e.status !== 'completed_image_pending_woocommerce' && !e.status.startsWith('error') && e.status !== 'completed_woocommerce_integration')) {
             await triggerNextPhotoProcessing(batchId, request.url);
          }
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, but some are still processing or it's a non-wizard batch not yet configured for WC.`, batchId: batchId, status: 'batch_in_progress_images' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
    const userId = photoData.userId || 'temp_user_id';

    console.log(`[API /api/process-photos] Starting processing for: ${photoData.imageName} (Doc ID: ${photoData.id}) in batch ${batchId}`);

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
      const generatedSeoName = generateSeoFilenameWithTemplate(photoData.imageName as string, photoData.productContext, templates);
      await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const originalProductNameForMeta = imageNameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
      const seoMetadata = generateSeoMetadataWithTemplate(generatedSeoName, originalProductNameForMeta, photoData.productContext, templates);
      await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const { assignedCategorySlug, assignedTags } = applyAutomationRules(imageNameWithoutExtension, photoData.productContext, automationRules);
      await photoDocRef.update({
        progress: 75,
        assignedCategorySlug: assignedCategorySlug || (photoData.productContext?.category || null),
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

    await triggerNextPhotoProcessing(batchId, request.url);
    return NextResponse.json({
      message: `Triggered next step for batch ${batchId} after processing ${photoData.imageName}.`,
      batchId: batchId,
      processedPhotoId: photoData.id,
      status: 'triggered_next_process'
    });

  } catch (error) {
    console.error(`[API /api/process-photos] General Error:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred';
    
    // Attempt to update Firestore status for the batch if possible, and if batchId is available
    if (adminDb && body && body.batchId) {
        try {
            const batchIdForError = body.batchId;
            const photosToUpdateSnapshot = await adminDb.collection('processing_status')
                                                  .where('batchId', '==', batchIdForError)
                                                  // Update all photos in the batch that might be stuck or affected
                                                  .get();
            if (!photosToUpdateSnapshot.empty) {
                const firestoreBatch = adminDb.batch();
                photosToUpdateSnapshot.forEach(doc => {
                    firestoreBatch.update(doc.ref, {
                        status: 'error_processing_image', // Or a more general error status like 'error_batch_processing'
                        errorMessage: `General error in API: ${errorMessage.substring(0, 200)}`,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
                await firestoreBatch.commit();
            }
        } catch (firestoreError) {
            console.error(`[API /api/process-photos] Failed to update Firestore status on general error:`, firestoreError);
        }
    }
    
    return NextResponse.json(
      { error: 'Failed to process photos due to a server error.', details: errorMessage },
      { status: 500 }
    );
  }
}

    