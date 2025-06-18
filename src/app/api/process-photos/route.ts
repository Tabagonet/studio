
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION } from '@/lib/constants';
import axios from 'axios';
import FormDataLib from "form-data"; // For creating FormData in Node.js for quefoto.es upload

// Helper function to upload a buffer to quefoto.es
async function uploadBufferToQueFoto(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const uploadFormData = new FormDataLib();
  uploadFormData.append("imagen", buffer, {
    filename: fileName,
    contentType: mimeType,
  });

  try {
    const response = await axios.post("https://quefoto.es/upload.php", uploadFormData, {
      headers: {
        ...uploadFormData.getHeaders(),
      },
    });
    if (response.data && response.data.success && response.data.url) {
      console.log(`[QueFoto Upload] Successfully uploaded ${fileName}. URL: ${response.data.url}`);
      return response.data.url;
    } else {
      console.error(`[QueFoto Upload] Failed to upload ${fileName}. Response:`, response.data);
      throw new Error(response.data.error || `Error al subir ${fileName} a quefoto.es`);
    }
  } catch (error) {
    console.error(`[QueFoto Upload] Axios error uploading ${fileName}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (axios.isAxiosError(error) && error.response) {
        console.error("[QueFoto Upload] Axios error response data:", error.response.data);
    }
    throw new Error(`Error conectando con quefoto.es para subir ${fileName}: ${errorMessage}`);
  }
}


async function downloadImageFromUrl(url: string): Promise<Buffer> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    throw new Error(`Failed to download image from ${url}. Status: ${(error as any).response?.status}`);
  }
}

function cleanTextForFilename(text: string): string {
  if (!text) return `imagen-desconocida-${Date.now()}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-.]/g, '') // Allow dots for extension
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function applyTemplate(templateContent: string, data: Record<string, string | number | undefined | null>): string {
  let result = templateContent;
  for (const key in data) {
    const placeholder = `{{${key}}}`;
    const value = (data[key] === null || data[key] === undefined) ? '' : String(data[key]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  result = result.replace(/\{\{[\w-]+\}\}/g, ''); // Remove unfulfilled placeholders
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
  originalName: string, // e.g., image00001.jpeg
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[],
  imageIndex: number // 0-based index of the image in the batch/product
): string {
  const originalNameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName; // "image00001"
  const originalExtension = originalName.substring(originalName.lastIndexOf('.') + 1) || 'jpeg';

  let baseNamePart = productContext?.name ? cleanTextForFilename(productContext.name) : 'producto-desconocido';
  let identifierPart = cleanTextForFilename(originalNameWithoutExtension); // "image00001"

  // Attempt to use a specific SEO name template
  let seoNameTemplate = templates.find(t =>
      t.type === 'nombre_seo' &&
      t.scope === 'categoria_especifica' &&
      productContext?.category && t.categoryValue === productContext.category
  );
  if (!seoNameTemplate) {
      seoNameTemplate = templates.find(t => t.type === 'nombre_seo' && t.scope === 'global');
  }

  if (seoNameTemplate && seoNameTemplate.content) {
      const templateData = {
          nombre_producto: productContext?.name || '',
          categoria: productContext?.category || '',
          sku: productContext?.sku || '',
          palabras_clave: productContext?.keywords || '',
          nombre_original_sin_extension: originalNameWithoutExtension,
          indice_imagen: String(imageIndex + 1),
      };
      const templatedName = applyTemplate(seoNameTemplate.content, templateData);
      if (templatedName && templatedName.length > 3) { // Ensure template added value
          return `${cleanTextForFilename(templatedName)}.webp`;
      }
  }

  // Fallback to product name + original image identifier for uniqueness
  return `${baseNamePart}-${identifierPart}.webp`;
}


function generateSeoMetadataWithTemplate(
  generatedSeoName: string,
  originalFileName: string,
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[],
  imageIndex: number
): { alt: string; title: string } {
  const originalNameWithoutExtension = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
  const productNameForTemplate = productContext?.name || originalNameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
  const attributesList = productContext?.attributes?.map(attr => `${attr.name}: ${attr.value}`) || [];
  const attributesSummaryForTemplate = attributesList.join(', ');

  const templateData = {
      nombre_producto: productNameForTemplate,
      categoria: productContext?.category || '',
      sku: productContext?.sku || '',
      palabras_clave: productContext?.keywords || '',
      atributos: attributesSummaryForTemplate,
      nombre_original_sin_extension: originalNameWithoutExtension,
      indice_imagen: String(imageIndex + 1),
      nombre_archivo_seo: generatedSeoName.replace('.webp', '')
  };

  let altText: string = '';
  let metaTemplate = templates.find(t =>
      t.type === 'metadatos_seo' &&
      t.scope === 'categoria_especifica' &&
      productContext?.category && t.categoryValue === productContext.category
  );
  if (!metaTemplate) {
      metaTemplate = templates.find(t => t.type === 'metadatos_seo' && t.scope === 'global');
  }

  if (metaTemplate && metaTemplate.content) {
    altText = applyTemplate(metaTemplate.content, templateData);
  }
  
  if (!altText) {
    altText = `${productNameForTemplate} - ${originalNameWithoutExtension} - imagen ${imageIndex + 1}`;
  }

  const titleText = altText; 
  altText = altText.substring(0, 125); 

  return {
    alt: altText, 
    title: titleText.substring(0, 200) 
  };
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
          if (trimmedTag) tagsToAssign.add(trimmedTag);
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
      timestamp: admin.firestore.FieldValue.serverTimestamp() as any,
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
    request: NextRequest,
    batchId: string,
    userId: string,
    productEntries: ProcessingStatusEntry[],
    templates: ProductTemplate[]
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
  const currentProductContext = primaryEntry.productContext;

  if (!currentProductContext) {
    console.log(`[WooCommerce] No productContext found for batch ${batchId}. Skipping WooCommerce product creation.`);
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

  const attributesSummaryForTemplate = currentProductContext.attributes?.map(attr => `${attr.name}: ${attr.value}`).join(', ') || '';
  const templateDataForDesc = {
      nombre_producto: currentProductContext.name,
      categoria: currentProductContext.category,
      sku: currentProductContext.sku,
      palabras_clave: currentProductContext.keywords,
      atributos: attributesSummaryForTemplate,
      precio_regular: currentProductContext.regularPrice,
      precio_oferta: currentProductContext.salePrice
  };

  let shortDescTemplate = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)
                       || templates.find(t => t.type === 'descripcion_corta' && t.scope === 'global');
  let generatedShortDescription = currentProductContext.shortDescription || '';
  if (shortDescTemplate && shortDescTemplate.content) {
      generatedShortDescription = applyTemplate(shortDescTemplate.content, templateDataForDesc);
  }
  if (!generatedShortDescription && currentProductContext.name) {
      generatedShortDescription = `${currentProductContext.name}. ${currentProductContext.keywords || ''}`.trim();
  } else if (!generatedShortDescription) {
      generatedShortDescription = "Descripción corta del producto.";
  }
  
  let longDescTemplate = templates.find(t => t.type === 'descripcion_larga' && t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)
                      || templates.find(t => t.type === 'descripcion_larga' && t.scope === 'global');
  let baseLongDescription = currentProductContext.longDescription || '';
  if (longDescTemplate && longDescTemplate.content) {
      baseLongDescription = applyTemplate(longDescTemplate.content, templateDataForDesc);
  }
  if (!baseLongDescription && currentProductContext.name) {
     baseLongDescription = `Descripción detallada de ${currentProductContext.name}. Categoría: ${currentProductContext.category || 'N/A'}. SKU: ${currentProductContext.sku || 'N/A'}.`;
  } else if (!baseLongDescription) {
     baseLongDescription = "Descripción detallada del producto.";
  }

  const imageDetailsForDescription = productEntries
    .map(entry => `- ${entry.seoName || entry.imageName}: (URL: ${entry.processedImageDownloadUrl || 'N/A'})`)
    .join('\n');
  const finalProductDescription = `${baseLongDescription}\n\nImágenes Procesadas:\n${imageDetailsForDescription}`;

  const wooImages = productEntries
    .filter(entry => entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce' && entry.seoMetadata && entry.seoName)
    .map((entry, index) => {
        return {
            src: entry.processedImageDownloadUrl, // This is now the quefoto.es URL of the processed image
            name: entry.seoName, 
            alt: entry.seoMetadata?.alt || entry.seoName,
            position: entry.productContext?.isPrimary ? 0 : index + 1
        };
    })
    .sort((a, b) => a.position - b.position);
  const primaryImageIndexWoo = wooImages.findIndex(img => img.position === 0);
  if (primaryImageIndexWoo > 0) { 
      const primaryImage = wooImages.splice(primaryImageIndexWoo, 1)[0];
      wooImages.unshift(primaryImage);
  } else if (primaryImageIndexWoo === -1 && wooImages.length > 0) { 
      wooImages[0].position = 0;
  }
  wooImages.forEach((img, idx) => img.position = idx);

  const wooCategoriesPayload: { slug?: string }[] = [];
  if (currentProductContext.category) {
    wooCategoriesPayload.push({ slug: currentProductContext.category });
  } else if (primaryEntry.assignedCategorySlug) { 
    wooCategoriesPayload.push({ slug: primaryEntry.assignedCategorySlug });
  }

  const wooProductData: any = {
    name: currentProductContext.name,
    type: currentProductContext.productType || 'simple',
    sku: currentProductContext.sku || '',
    regular_price: currentProductContext.regularPrice,
    description: finalProductDescription,
    short_description: generatedShortDescription,
    categories: wooCategoriesPayload,
    tags: primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [],
    images: wooImages,
    meta_data: [
        { key: '_wooautomate_batch_id', value: batchId },
        { key: '_external_image_urls', value: productEntries.map(e => e.processedImageDownloadUrl) }
    ]
  };

  if (currentProductContext.salePrice) {
    wooProductData.sale_price = currentProductContext.salePrice;
  }
  if (currentProductContext.attributes && currentProductContext.attributes.length > 0 && currentProductContext.attributes.some(attr => attr.name && attr.value)) {
    wooProductData.attributes = currentProductContext.attributes
        .filter(attr => attr.name && attr.value) 
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()), 
            position: index,
            visible: true,
            variation: currentProductContext.productType === 'variable' 
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
    let errorDetails = error.response?.data ? JSON.stringify(error.response.data) : "";
    if (error.response?.config?.data) { 
        const requestDataString = JSON.stringify(error.response.config.data, (key, value) => key === 'images' ? '[IMAGES OMITTED]' : value );
        errorDetails += ` | Request Data: ${requestDataString.substring(0, 1000)}...`; // Limit length
    }
    console.error(`[WooCommerce] Error creating product for batch ${batchId}:`, errorMessage, errorDetails);
    await updateFirestoreStatusForBatch(batchId, 'error_woocommerce_integration', `WooCommerce Error: ${errorMessage.substring(0,500)}`);
    if (adminDb) {
        await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
            userId,
            title: `Error al crear producto en WooCommerce (Lote: ${batchId})`,
            description: `Detalles: ${errorMessage.substring(0, 200)}`,
            type: 'error',
            timestamp: admin.firestore.FieldValue.serverTimestamp() as any,
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
    if (status.startsWith('error') && message) updateData.errorMessage = message.substring(0, 500);
    if (wooProductId) updateData.productAssociationId = String(wooProductId);
    if (status === 'completed_woocommerce_integration' || status.startsWith('error_woocommerce')) {
        updateData.progress = 100;
    }
    firestoreBatch.update(doc.ref, updateData);
  });
  await firestoreBatch.commit();
  console.log(`[Firestore] Updated status for batch ${batchId} to ${status}.`);
}

const MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES_PROCESS_PHOTOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];


export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {}; 
  try {
    if (!adminDb || !adminAuth) {
      console.error("[API /api/process-photos] Firebase Admin SDK (Firestore or Auth) is not initialized.");
      return NextResponse.json(
        { error: 'Server configuration error: Firebase Admin SDK not initialized.' },
        { status: 500 }
      );
    }
    
    body = await request.json();
    const { batchId } = body;
    const userIdFromRequest = body.userId;


    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}`);

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .orderBy(admin.firestore.FieldPath.documentId()) 
                                          .limit(1)
                                          .get();

    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();

    if (photosToProcessSnapshot.empty) {
      const allBatchEntriesSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .get();

      if (allBatchEntriesSnapshot.empty) {
        return NextResponse.json({ message: `Batch ${batchId} has no entries.`, batchId: batchId, status: 'batch_empty' }, { status: 200 });
      }

      const allEntries = allBatchEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      const isWizardFlow = allEntries.some(e => e.productContext);
      const userIdForNotification = userIdFromRequest || allEntries[0]?.userId || 'temp_user_id_fallback';

      const allImageProcessingDone = allEntries.every(
        e => e.status === 'completed_image_pending_woocommerce' || e.status.startsWith('error_processing_image') || e.status === 'completed_woocommerce_integration' || e.status === 'error_woocommerce_integration'
      );

      const needsWooCommerceProcessing = allEntries.some(e => e.status === 'completed_image_pending_woocommerce');

      if (allImageProcessingDone && needsWooCommerceProcessing && isWizardFlow) {
          console.log(`[API /api/process-photos] All images processed for wizard batch ${batchId}. Attempting WooCommerce creation.`);
          await createOrUpdateWooCommerceProduct(
            request,
            batchId,
            userIdForNotification,
            allEntries.filter(e => e.status === 'completed_image_pending_woocommerce' || e.status === 'completed_woocommerce_integration'),
            allTemplates
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
             if (allEntries.some(e => e.status === 'uploaded' || e.status.startsWith('processing_image_'))) {
                await triggerNextPhotoProcessing(batchId, request.url);
             }
          }
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}, processing status: some pending or non-wizard batch.`, batchId: batchId, status: 'batch_in_progress_images' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
    const currentUserId = userIdFromRequest || photoData.userId || 'temp_user_id_fallback';

    const allBatchPhotoDocs = (await adminDb.collection('processing_status').where('batchId', '==', batchId).get()).docs;
    const overallPhotoIndex = allBatchPhotoDocs.findIndex(doc => doc.id === photoData.id);


    console.log(`[API /api/process-photos] Starting processing for: ${photoData.imageName} (Doc ID: ${photoData.id}) in batch ${batchId}`);

    try {
      await photoDocRef.update({
        status: 'processing_image_started',
        progress: 5,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!photoData.originalDownloadUrl) {
          throw new Error(`Missing originalDownloadUrl (external URL) for ${photoData.imageName}`);
      }
      console.log(`[API /api/process-photos] Downloading image ${photoData.imageName} from ${photoData.originalDownloadUrl}`);
      const imageBuffer = await downloadImageFromUrl(photoData.originalDownloadUrl);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      if (imageBuffer.length > MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS) {
          throw new Error(`File ${photoData.imageName} (downloaded) exceeds max size of ${MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES_PROCESS_PHOTOS.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photoData.imageName} (downloaded): ${type?.mime || 'unknown'}.`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) // Keep metadata if any, or remove if not needed
                                      .toBuffer();
      await photoDocRef.update({ progress: 45, status: 'processing_image_optimized', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const generatedSeoName = generateSeoFilenameWithTemplate(
          photoData.imageName as string,
          photoData.productContext,
          allTemplates,
          overallPhotoIndex >= 0 ? overallPhotoIndex : 0
      );
      await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const seoMetadata = generateSeoMetadataWithTemplate(
          generatedSeoName,
          photoData.imageName as string,
          photoData.productContext,
          allTemplates,
          overallPhotoIndex >= 0 ? overallPhotoIndex : 0
      );
      await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const { assignedCategorySlug, assignedTags } = applyAutomationRules(
        (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')),
        photoData.productContext,
        allAutomationRules
      );
      await photoDocRef.update({
        progress: 75,
        assignedCategorySlug: assignedCategorySlug || (photoData.productContext?.category || null),
        assignedTags: assignedTags.length > 0 ? assignedTags : (photoData.productContext?.keywords?.split(',').map(k=>k.trim()).filter(k=>k) || []),
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const processedImageExternalUrl = await uploadBufferToQueFoto(
        processedImageBuffer,
        generatedSeoName, // Use SEO name for the uploaded file
        'image/webp'      // Mime type of processed image
      );
      await photoDocRef.update({ 
        progress: 90, 
        status: 'processing_image_reuploaded', 
        processedImageDownloadUrl: processedImageExternalUrl, 
        processedImageStoragePath: processedImageExternalUrl, // Store external URL
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      await photoDocRef.update({
          status: 'completed_image_pending_woocommerce',
          progress: 100,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[API /api/process-photos] Successfully processed ${photoData.imageName}. Status 'completed_image_pending_woocommerce'. Processed URL: ${processedImageExternalUrl}`);

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

    if (adminDb && body && body.batchId) {
        try {
            const batchIdForError = body.batchId;
            // Attempt to update status of any 'active' processing entries for this batch to error.
            const photosToUpdateSnapshot = await adminDb.collection('processing_status')
                                                  .where('batchId', '==', batchIdForError)
                                                  .where('status', 'in', [
                                                      'processing_image_started',
                                                      'processing_image_downloaded',
                                                      'processing_image_validated',
                                                      'processing_image_optimized',
                                                      'processing_image_seo_named',
                                                      'processing_image_metadata_generated',
                                                      'processing_image_rules_applied',
                                                      'processing_image_reuploaded',
                                                      'uploaded' 
                                                    ])
                                                  .get();
            if (!photosToUpdateSnapshot.empty) {
                const firestoreBatch = adminDb.batch();
                photosToUpdateSnapshot.forEach(docToUpdate => {
                    firestoreBatch.update(docToUpdate.ref, {
                        status: 'error_processing_image',
                        errorMessage: `General API error: ${errorMessage.substring(0, 200)}`, 
                        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any
                    });
                });
                await firestoreBatch.commit();
            } else {
                console.warn(`[API /api/process-photos] General error occurred for batch ${batchIdForError}, but no photos were in an active processing state to update to error.`);
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

    