
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
import { wooApi } from '@/lib/woocommerce'; // Import WooCommerce API client

// Helper function to upload a buffer to quefoto.es
async function uploadBufferToQueFoto(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const uploadFormData = new FormDataLib();
  uploadFormData.append("imagen", buffer, {
    filename: fileName,
    contentType: mimeType,
  });
  console.log(`[QueFoto Upload] Attempting to upload ${fileName} (${(buffer.length / 1024).toFixed(2)} KB) to quefoto.es`);
  try {
    const response = await axios.post("https://quefoto.es/upload.php", uploadFormData, {
      headers: {
        ...uploadFormData.getHeaders(),
      },
      timeout: 30000, // 30 second timeout for upload
    });
    if (response.data && response.data.success && response.data.url) {
      console.log(`[QueFoto Upload] Successfully uploaded ${fileName}. URL: ${response.data.url}`);
      return response.data.url;
    } else {
      console.error(`[QueFoto Upload] Failed to upload ${fileName}. Response:`, response.data);
      throw new Error(response.data.error || `Error al subir ${fileName} a quefoto.es (Respuesta no exitosa)`);
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
  console.log(`[Download Image] Attempting to download from ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 }); // 30 second timeout
    console.log(`[Download Image] Successfully downloaded from ${url}. Size: ${(response.data.length / 1024).toFixed(2)} KB`);
    return Buffer.from(response.data);
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
     if (axios.isAxiosError(error) && error.response) {
        console.error("[Download Image] Axios error response data:", error.response.data);
    }
    throw new Error(`Failed to download image from ${url}. Status: ${(error as any).response?.status}. Message: ${errorMessage}`);
  }
}

function cleanTextForFilename(text: string): string {
  if (!text) return `imagen-desconocida-${Date.now()}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-.]/g, '') 
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
  result = result.replace(/\{\{[\w-]+\}\}/g, ''); 
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

// Function to fetch all WooCommerce categories (cached if possible or on demand)
let allWooCategoriesCache: WooCommerceCategory[] | null = null;
async function fetchWooCommerceCategories(): Promise<WooCommerceCategory[]> {
    if (allWooCategoriesCache) {
        // console.log("[WooCommerce Categories] Using cached categories.");
        return allWooCategoriesCache;
    }
    if (!wooApi) {
        console.warn("[WooCommerce Categories] API client not initialized. Cannot fetch categories.");
        return [];
    }
    try {
        // console.log("[WooCommerce Categories] Fetching categories from WooCommerce...");
        const response = await wooApi.get("products/categories", { per_page: 100, orderby: "name", order: "asc" });
        if (response.status === 200 && Array.isArray(response.data)) {
            allWooCategoriesCache = response.data.map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug }));
            // console.log(`[WooCommerce Categories] Fetched ${allWooCategoriesCache.length} categories.`);
            return allWooCategoriesCache;
        } else {
            console.error("[WooCommerce Categories] Failed to fetch categories, response not OK or not an array:", response.status, response.data);
            return [];
        }
    } catch (error) {
        console.error("[WooCommerce Categories] Error fetching WooCommerce categories:", error);
        return [];
    }
}


function generateSeoFilenameWithTemplate(
  originalName: string,
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[],
  imageIndex: number
): string {
  const originalNameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;
  // const originalExtension = originalName.substring(originalName.lastIndexOf('.') + 1) || 'jpeg';

  let baseNamePart = productContext?.name ? cleanTextForFilename(productContext.name) : 'producto';
  
  // Fallback: product name + original image identifier (cleaned) + index
  const cleanedOriginalIdentifier = cleanTextForFilename(originalNameWithoutExtension);
  let fallbackSeoName = `${baseNamePart}-${cleanedOriginalIdentifier}-${imageIndex + 1}.webp`;

  const seoNameTemplate = templates.find(t =>
      t.type === 'nombre_seo' &&
      (t.scope === 'global' || (t.scope === 'categoria_especifica' && productContext?.category && t.categoryValue === productContext.category))
  );

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
      if (templatedName && templatedName.length > 3 && templatedName !== productContext?.name) {
          return `${cleanTextForFilename(templatedName)}.webp`;
      }
  }
  
  // If template didn't work or resulted in a generic name, use the more unique fallback
  return fallbackSeoName;
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
      nombre_archivo_seo: generatedSeoName.replace(/\.webp$/i, '') // Remove .webp for template use
  };

  let altText: string = '';
  let metaTemplate = templates.find(t =>
      t.type === 'metadatos_seo' &&
      (t.scope === 'global' || (t.scope === 'categoria_especifica' && productContext?.category && t.categoryValue === productContext.category))
  );

  if (metaTemplate && metaTemplate.content) {
    altText = applyTemplate(metaTemplate.content, templateData);
  }
  
  if (!altText || altText.length < 5) { // Ensure alt text is somewhat meaningful
    altText = `${productNameForTemplate} - ${originalNameWithoutExtension.replace(/-/g, ' ')} - Imagen ${imageIndex + 1}`;
  }

  const titleText = altText; // Keep title same as alt for simplicity, or make it more concise if needed
  
  // Truncate to reasonable lengths for SEO and system limits
  return {
    alt: altText.substring(0, 125), 
    title: titleText.substring(0, 200) 
  };
}


function applyAutomationRules(
  imageNameWithoutExtension: string,
  productContext: WizardProductContext | undefined,
  rules: AutomationRule[]
): { assignedCategorySlug?: string; assignedTags: string[] } {
  let categoryToAssignSlug: string | undefined = productContext?.category; // Start with category from wizard
  const initialTags = productContext?.keywords?.split(',').map(k => k.trim()).filter(k => k) || [];
  const tagsToAssign = new Set<string>(initialTags);
  const searchableProductName = (productContext?.name || imageNameWithoutExtension).toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');

  rules.forEach(rule => {
    if (rule.keyword && searchableProductName.includes(rule.keyword.toLowerCase())) {
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssignSlug = rule.categoryToAssign; // Rule overrides wizard category
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
    let successCount = 0; // completed_image_pending_woocommerce
    let wooSuccessCount = 0; // completed_woocommerce_integration
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
    const allImageRelatedStatusesDone = successCount + wooSuccessCount + errorCount === totalCount;

    if (isWizard) {
        if (wooSuccessCount > 0) {
            description = `Producto creado/actualizado en WooCommerce. ${wooSuccessCount} imágenes integradas.`;
            if (successCount > 0) description += ` ${successCount} imágenes adicionales procesadas pendientes de integración (revisar errores previos de WC).`;
        } else if (successCount > 0 && allImageRelatedStatusesDone) { // All images done, but WC failed for all
            description = `Procesamiento de ${successCount} imágenes completo. Hubo un error al integrar con WooCommerce.`;
        } else if (errorCount === totalCount) {
            description = `Todas las ${errorCount} imágenes fallaron durante el procesamiento.`;
        } else {
             description = `Procesamiento en curso o con errores mixtos. ${wooSuccessCount} integradas, ${successCount} procesadas, ${errorCount} errores.`;
        }
         if (errorCount > 0 && (wooSuccessCount > 0 || successCount > 0) && errorCount !== totalCount) {
            description += ` Adicionalmente, ${errorCount} imágenes tuvieron errores de procesamiento.`;
        }
    } else { // Batch processing
        description = `${wooSuccessCount + successCount} de ${totalCount} imágenes procesadas exitosamente. ${errorCount > 0 ? `${errorCount} con errores.` : ''}`;
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
    body: JSON.stringify({ batchId }), // Only send batchId if userId is not strictly needed by the re-trigger
  }).catch(error => {
    console.error(`[API /api/process-photos] Error self-triggering for batch ${batchId}:`, error);
  });
}

async function createOrUpdateWooCommerceProduct(
    request: NextRequest, // Pass the full request
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
  const currentProductContext = primaryEntry.productContext; // This should be present for wizard flow

  if (!currentProductContext) {
    console.log(`[WooCommerce] No productContext found for batch ${batchId}. Skipping WooCommerce product creation.`);
    // This implies it's a batch flow without detailed product context, or an error.
    // For batch, we might only update status if images were processed.
    // For wizard, this is an error state.
    await updateFirestoreStatusForBatch(batchId, 'completed_image_pending_woocommerce', "Skipped WooCommerce: No product context for wizard flow or not applicable for batch flow.");
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

  console.log(`[WooCommerce] Attempting to create product in WooCommerce for batch ${batchId}`);

  const attributesSummaryForTemplate = currentProductContext.attributes?.map(attr => `${attr.name}: ${attr.value}`).join(', ') || '';
  const templateDataForDesc = {
      nombre_producto: currentProductContext.name,
      categoria: currentProductContext.category, // slug
      sku: currentProductContext.sku,
      palabras_clave: currentProductContext.keywords,
      atributos: attributesSummaryForTemplate,
      precio_regular: currentProductContext.regularPrice,
      precio_oferta: currentProductContext.salePrice
  };

  // Apply Short Description Template
  let shortDescTemplate = templates.find(t => t.type === 'descripcion_corta' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)));
  let generatedShortDescription = currentProductContext.shortDescription || ''; // User input from wizard takes precedence
  if (!generatedShortDescription && shortDescTemplate && shortDescTemplate.content) {
      generatedShortDescription = applyTemplate(shortDescTemplate.content, templateDataForDesc);
  }
  if (!generatedShortDescription) { // Fallback if still empty
      generatedShortDescription = `${currentProductContext.name || 'Producto'} - ${currentProductContext.keywords || 'ver detalles'}.`;
  }
  
  // Apply Long Description Template
  let longDescTemplate = templates.find(t => t.type === 'descripcion_larga' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)));
  let baseLongDescription = currentProductContext.longDescription || ''; // User input from wizard takes precedence
  if (!baseLongDescription && longDescTemplate && longDescTemplate.content) {
      baseLongDescription = applyTemplate(longDescTemplate.content, templateDataForDesc);
  }
  if (!baseLongDescription) { // Fallback if still empty
     baseLongDescription = `Descripción detallada de ${currentProductContext.name || 'este producto'}. Categoría: ${currentProductContext.category || 'N/A'}. SKU: ${currentProductContext.sku || 'N/A'}.`;
  }

  const imageDetailsForDescription = productEntries
    .map(entry => `- ${entry.seoName || entry.imageName}: (URL: ${entry.processedImageDownloadUrl || 'N/A'})`)
    .join('\n');
  const finalProductDescription = `${baseLongDescription}\n\nImágenes Procesadas:\n${imageDetailsForDescription}`;

  const wooImages = productEntries
    .filter(entry => entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce' && entry.seoMetadata && entry.seoName)
    .map((entry, index) => {
        return {
            src: entry.processedImageDownloadUrl, // This is the quefoto.es URL of the processed image
            name: entry.seoName, 
            alt: entry.seoMetadata?.alt || entry.seoName,
            position: entry.productContext?.isPrimary ? 0 : index + 1 // Ensure primary is 0
        };
    })
    .sort((a, b) => a.position - b.position); // Sort by position
  
  // Ensure unique positions starting from 0
  wooImages.forEach((img, idx) => img.position = idx);


  const wooCategoriesPayload: { slug?: string }[] = [];
  const categorySlugToUse = currentProductContext.category || primaryEntry.assignedCategorySlug;
  if (categorySlugToUse) {
    wooCategoriesPayload.push({ slug: categorySlugToUse });
    console.log(`[WooCommerce] Assigning category slug: ${categorySlugToUse}`);
  } else {
    console.log("[WooCommerce] No category slug specified or assigned.");
  }


  const wooProductData: any = {
    name: currentProductContext.name,
    type: currentProductContext.productType || 'simple',
    sku: currentProductContext.sku || '',
    regular_price: String(currentProductContext.regularPrice), // Ensure string
    description: finalProductDescription,
    short_description: generatedShortDescription,
    categories: wooCategoriesPayload,
    tags: primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [],
    images: wooImages, // Array of image objects with src from quefoto.es
    meta_data: [
        { key: '_wooautomate_batch_id', value: batchId },
        { key: '_external_image_urls', value: productEntries.map(e => e.processedImageDownloadUrl).filter(url => !!url) }
    ]
  };

  if (currentProductContext.salePrice) {
    wooProductData.sale_price = String(currentProductContext.salePrice); // Ensure string
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

  console.log(`[WooCommerce] About to create product. Number of images to send: ${wooImages.length}`);
  if (wooImages.length > 0) {
      console.log(`[WooCommerce] Sample image URL being sent: ${wooImages[0].src}`);
  } else {
      console.log("[WooCommerce] No images will be sent to WooCommerce for this product.");
  }
  console.log("[WooCommerce] Full Product data to send:", JSON.stringify(wooProductData, null, 2));


  try {
    const response = await wooApi.post("products", wooProductData);
    const wooProductId = response.data.id;
    console.log(`[WooCommerce] Product ${wooProductId} created successfully for batch ${batchId}.`);
    await updateFirestoreStatusForBatch(batchId, 'completed_woocommerce_integration', `Product created: ${wooProductId}`, wooProductId);
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || error.message || "Unknown WooCommerce API error";
    let errorDetails = error.response?.data ? JSON.stringify(error.response.data) : "No additional details from API.";
    if (error.response?.config?.data) { 
        // Avoid logging potentially huge image data if it were part of request (it's not for this API)
        // const requestDataString = JSON.stringify(error.response.config.data, (key, value) => key === 'images' ? '[IMAGES OMITTED]' : value );
        // errorDetails += ` | Request Data (Structure Summary): ${requestDataString.substring(0, 1000)}...`; // Limit length
    }
    console.error(`[WooCommerce] Error creating product for batch ${batchId}: ${errorMessage}`, errorDetails);
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
    if (status.startsWith('error') && message) updateData.errorMessage = message.substring(0, 500); // Limit error message length
    if (wooProductId) updateData.productAssociationId = String(wooProductId); // Ensure string
    if (status === 'completed_woocommerce_integration' || status.startsWith('error_woocommerce')) {
        updateData.progress = 100;
    }
    firestoreBatch.update(doc.ref, updateData);
  });
  await firestoreBatch.commit();
  console.log(`[Firestore] Updated status for batch ${batchId} to ${status}. Message: ${message || 'N/A'}`);
}

const MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];


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
    const userIdFromRequest = body.userId; // This might be passed from wizard, or undefined from batch self-trigger


    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Received request for batchId: ${batchId}, userId from request: ${userIdFromRequest}`);

    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded') // Only pick up 'uploaded'
                                          .orderBy(admin.firestore.FieldPath.documentId()) // Ensure consistent order if needed
                                          .limit(1)
                                          .get();

    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();
    // Fetch WooCommerce categories once per batch processing cycle if needed for rules/templates
    await fetchWooCommerceCategories(); 


    if (photosToProcessSnapshot.empty) {
      console.log(`[API /api/process-photos] No photos in 'uploaded' state for batch ${batchId}. Checking overall batch status.`);
      const allBatchEntriesSnapshot = await adminDb.collection('processing_status')
                                            .where('batchId', '==', batchId)
                                            .get();

      if (allBatchEntriesSnapshot.empty) {
        console.log(`[API /api/process-photos] Batch ${batchId} has no entries at all.`);
        return NextResponse.json({ message: `Batch ${batchId} has no entries.`, batchId: batchId, status: 'batch_empty' }, { status: 200 });
      }

      const allEntries = allBatchEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      const isWizardFlow = allEntries.some(e => e.productContext); // Determine if it's a wizard flow
      const userIdForNotification = userIdFromRequest || allEntries[0]?.userId || 'temp_user_id_fallback_notification';
      
      const allImageProcessingDone = allEntries.every(
        e => e.status === 'completed_image_pending_woocommerce' || 
             e.status.startsWith('error_processing_image') || 
             e.status === 'completed_woocommerce_integration' || 
             e.status === 'error_woocommerce_integration'
      );

      const needsWooCommerceProcessing = allEntries.some(e => e.status === 'completed_image_pending_woocommerce');

      if (allImageProcessingDone && needsWooCommerceProcessing && isWizardFlow) {
          console.log(`[API /api/process-photos] All images processed for wizard batch ${batchId}. Attempting WooCommerce creation.`);
          await createOrUpdateWooCommerceProduct(
            request, // Pass the original request for base URL derivation
            batchId,
            userIdForNotification,
            allEntries.filter(e => e.status === 'completed_image_pending_woocommerce' || e.status === 'completed_woocommerce_integration'), // Send only relevant entries
            allTemplates // Pass fetched templates
          );
          // Notification will be created after WooCommerce attempt, inside createOrUpdateWooCommerceProduct or if it determines already done.
          // Final check for notification if all done
          const finalBatchSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
          const finalEntries = finalBatchSnapshot.docs.map(doc => doc.data() as ProcessingStatusEntry);
          if (finalEntries.every(e => e.status === 'completed_woocommerce_integration' || e.status.startsWith('error_'))) {
             await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          }
          return NextResponse.json({ message: `Batch ${batchId} image processing complete. WooCommerce integration attempted.`, batchId: batchId, status: 'batch_woocommerce_triggered' }, { status: 200 });
      
      } else if (allImageProcessingDone && !needsWooCommerceProcessing) {
          console.log(`[API /api/process-photos] Batch ${batchId} fully complete (image processing and WooCommerce integration done or errored out). Creating final notification if needed.`);
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardFlow);
          return NextResponse.json({ message: `Batch ${batchId} processing fully complete.`, batchId: batchId, status: 'batch_completed_final' }, { status: 200 });
      
      } else {
          console.log(`[API /api/process-photos] Batch ${batchId}: No 'uploaded' photos, but some tasks might still be pending or it's a non-wizard batch awaiting manual action.`);
          // If some are still in 'uploaded' or 'processing_image_*' states, it implies a previous run might have failed to self-trigger.
          // However, the main query at the start of POST already looks for 'uploaded'. If it's empty, this block is hit.
          // So, if we are here, it means NO photos are 'uploaded'. They are either processed, error, or in WC states.
          // The conditions above (allImageProcessingDone && needsWooCommerceProcessing && isWizardFlow) or (allImageProcessingDone && !needsWooCommerceProcessing) should cover these.
          // This 'else' might indicate an unexpected state or a non-wizard batch that doesn't auto-trigger WC.
          if (!allImageProcessingDone) {
             console.log(`[API /api/process-photos] Batch ${batchId} is still in progress (not all images are in a final processing state). No further action taken by this instance.`);
          }
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}. Current state suggests processing is ongoing or requires manual intervention for non-wizard batches.`, batchId: batchId, status: 'batch_in_progress_or_stalled' }, { status: 200 });
      }
    }

    // If we have photos to process from the snapshot
    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
    
    // Determine userId for this specific photo's processing context
    const currentPhotoUserId = userIdFromRequest || photoData.userId || 'temp_user_id_photo_process';

    const allBatchPhotoDocsForIndex = (await adminDb.collection('processing_status').where('batchId', '==', batchId).orderBy(admin.firestore.FieldPath.documentId()).get()).docs;
    const overallPhotoIndex = allBatchPhotoDocsForIndex.findIndex(doc => doc.id === photoData.id);


    console.log(`[API /api/process-photos] Starting processing for image: ${photoData.imageName} (Doc ID: ${photoData.id}, Index: ${overallPhotoIndex}) in batch ${batchId}`);

    try {
      await photoDocRef.update({
        status: 'processing_image_started',
        progress: 5,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (!photoData.originalDownloadUrl) {
          throw new Error(`Missing originalDownloadUrl (external URL from quefoto.es) for ${photoData.imageName}`);
      }
      
      const imageBuffer = await downloadImageFromUrl(photoData.originalDownloadUrl);
      await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      if (imageBuffer.length > MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS) {
          throw new Error(`File ${photoData.imageName} (downloaded from quefoto.es) exceeds max size of ${MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS / (1024 * 1024)}MB.`);
      }
      const type = await fileTypeFromBuffer(imageBuffer);
      if (!type || !ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT.includes(type.mime)) {
          throw new Error(`Invalid file type for ${photoData.imageName} (downloaded): ${type?.mime || 'unknown'}. Allowed: ${ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT.join(', ')}`);
      }
      await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const processedImageBuffer = await sharp(imageBuffer)
                                      .webp({ quality: 80 })
                                      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
                                      .withMetadata({}) 
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
        assignedCategorySlug: assignedCategorySlug || (photoData.productContext?.category || null), // Ensure null if empty
        assignedTags: assignedTags.length > 0 ? assignedTags : (photoData.productContext?.keywords?.split(',').map(k=>k.trim()).filter(k=>k) || []),
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`[API /api/process-photos] Uploading processed image ${generatedSeoName} to quefoto.es`);
      const processedImageExternalUrl = await uploadBufferToQueFoto(
        processedImageBuffer,
        generatedSeoName, 
        'image/webp'      
      );
      await photoDocRef.update({ 
        progress: 90, 
        status: 'processing_image_reuploaded', 
        processedImageDownloadUrl: processedImageExternalUrl, 
        processedImageStoragePath: processedImageExternalUrl, 
        updatedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      await photoDocRef.update({
          status: 'completed_image_pending_woocommerce',
          progress: 100,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[API /api/process-photos] Successfully processed ${photoData.imageName}. Status 'completed_image_pending_woocommerce'. Processed URL (quefoto.es): ${processedImageExternalUrl}`);

    } catch (imageError) {
      console.error(`[API /api/process-photos] Error processing ${photoData.imageName} (Doc ID: ${photoData.id}):`, imageError);
      const currentProgress = (photoData.progress as number || 0);
      await photoDocRef.update({
        status: 'error_processing_image',
        errorMessage: imageError instanceof Error ? imageError.message.substring(0,500) : String(imageError).substring(0,500),
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

  } catch (error) // General catch for the whole POST function
  {
    console.error(`[API /api/process-photos] General Error in POST for batch ${body?.batchId || 'unknown'}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred during photo processing.';

    if (adminDb && body && body.batchId) {
        try {
            const batchIdForError = body.batchId;
            const photosToUpdateSnapshot = await adminDb.collection('processing_status')
                                                  .where('batchId', '==', batchIdForError)
                                                  .where('status', 'in', [
                                                      'processing_image_started', 'processing_image_downloaded',
                                                      'processing_image_validated', 'processing_image_optimized',
                                                      'processing_image_seo_named', 'processing_image_metadata_generated',
                                                      'processing_image_rules_applied', 'processing_image_reuploaded',
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
            }
        } catch (firestoreError) {
            console.error(`[API /api/process-photos] Failed to update Firestore status on general error for batch ${body.batchId}:`, firestoreError);
        }
    }
    return NextResponse.json(
      { error: 'Failed to process photos due to a server error.', details: errorMessage.substring(0, 500) },
      { status: 500 }
    );
  }
}

    
