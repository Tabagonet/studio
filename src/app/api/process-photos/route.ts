
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory, ProductType } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION } from '@/lib/constants';
import axios from 'axios';
import FormDataLib from "form-data";
import { wooApi } from '@/lib/woocommerce';
import path from 'path';
import { generateProductDescription } from '@/ai/flows/generate-product-description';


async function uploadBufferToQueFoto(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const uploadFormData = new FormDataLib();
  uploadFormData.append("imagen", buffer, {
    filename: fileName,
    contentType: mimeType,
  });
  console.log(`[QueFoto Upload] Attempting to upload "${fileName}" (${(buffer.length / 1024).toFixed(2)} KB, mime: ${mimeType}) to https://quefoto.es/cargafotos.php`);
  try {
    const response = await axios.post("https://quefoto.es/cargafotos.php", uploadFormData, {
      headers: {
        ...uploadFormData.getHeaders(),
      },
      timeout: 30000, // 30 segundos de timeout
    });
    if (response.data && response.data.success && response.data.url) {
      console.log(`[QueFoto Upload] Successfully uploaded "${fileName}". URL from quefoto.es: ${response.data.url}. Saved as: ${response.data.filename_saved}`);
      return response.data.url;
    } else {
      console.error(`[QueFoto Upload] Failed to upload "${fileName}" to quefoto.es. Response:`, response.data);
      throw new Error(response.data.error || `Error al subir ${fileName} a quefoto.es (Respuesta no exitosa). Server response: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error(`[QueFoto Upload] Axios error uploading "${fileName}" to quefoto.es:`, error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (axios.isAxiosError(error) && error.response) {
        console.error("[QueFoto Upload] Axios error response data:", error.response.data);
    }
    throw new Error(`Error conectando con quefoto.es para subir ${fileName}: ${errorMessage}`);
  }
}

async function deleteImageFromQueFoto(imageUrl: string): Promise<void> {
  if (!imageUrl) {
    console.warn("[QueFoto Delete] No image URL provided for deletion.");
    return;
  }

  let fileName;
  try {
    fileName = path.basename(new URL(imageUrl).pathname);
  } catch (e) {
     console.warn(`[QueFoto Delete] Could not parse URL or extract filename from invalid URL: ${imageUrl}`);
     return; // No intentar eliminar si la URL es inválida
  }

  if (!fileName) {
    console.warn(`[QueFoto Delete] Could not extract filename from URL: ${imageUrl}`);
    return;
  }

  console.log(`[QueFoto Delete] Attempting to delete ${fileName} from quefoto.es (Source URL: ${imageUrl})`);
  try {
    const response = await axios.post(
      "https://quefoto.es/delete.php",
      { fileName: fileName }, // Enviar como JSON
      { headers: { "Content-Type": "application/json" }, timeout: 15000 } // 15 segundos timeout
    );

    const data = response.data;
    if (data && data.success) {
      console.log(`[QueFoto Delete] Successfully deleted ${fileName} from quefoto.es.`);
    } else {
      // No lanzar error, solo advertir, ya que el producto principal podría haberse creado.
      const deleteErrorMsg = data && data.error ? data.error : "Unknown error during deletion from quefoto.es";
      console.warn(`[QueFoto Delete] Failed to delete ${fileName} from quefoto.es: ${deleteErrorMsg}. Response:`, data);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[QueFoto Delete] Axios error deleting ${fileName} from quefoto.es: ${errorMessage}`);
    if (axios.isAxiosError(error) && error.response) {
        console.warn("[QueFoto Delete] Axios error response data:", error.response.data);
    }
  }
}

async function downloadImageFromUrl(url: string): Promise<Buffer> {
  console.log(`[Download Image] Attempting to download from ${url}`);
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 }); // 30 segundos timeout
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
  if (!text) return `imagen-desconocida-${Date.now().toString().slice(-5)}`;
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^\w-]+/g, '') // Remove non-alphanumeric characters (except hyphens and underscores)
    .replace(/-+/g, '-') // Replace multiple hyphens with a single one
    .replace(/^-+|-+$/g, ''); // Trim hyphens from start/end
}


function applyTemplate(templateContent: string, data: Record<string, string | number | undefined | null>): string {
  let result = templateContent;

  // Simplified {{#if variable}}...{{/if}} handling
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
    const value = data[variableName];
    // Consider price '0' or '0.00' as not set for this conditional block
    if (variableName.toLowerCase().includes('price')) {
        return (value !== undefined && value !== null && String(value).trim() !== '' && parseFloat(String(value)) > 0) ? innerContent.trim() : '';
    }
    // For other variables, check if truthy (not empty string, not null, not undefined, not 0, not false)
    if (value && String(value).trim() !== '' && value !== 0 && value !== false) {
      return innerContent.trim();
    } else {
      return '';
    }
  });

  // Replace standard placeholders {{variable}}
  for (const key in data) {
    const placeholder = `{{${key}}}`;
    const value = (data[key] === null || data[key] === undefined) ? '' : String(data[key]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  // Remove any unreplaced placeholders like {{unmatched_variable}}
  result = result.replace(/\{\{[\w-]+\}\}/g, '').trim();
  return result;
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
        console.log("[WooCommerce Categories] Fetching categories from WooCommerce...");
        const response = await wooApi.get("products/categories", { per_page: 100, orderby: "name", order: "asc" });
        if (response.status === 200 && Array.isArray(response.data)) {
            allWooCategoriesCache = response.data.map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug }));
            console.log(`[WooCommerce Categories] Fetched ${allWooCategoriesCache.length} categories.`);
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
  imageIndex: number // Index of this image within its product group
): string {
  const originalNameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

  // Prioritize product name from context if available and not empty
  let baseNameForSeo = productContext?.name && productContext.name.trim() !== ''
    ? productContext.name
    : originalNameWithoutExtension; // Fallback to original image name

  baseNameForSeo = cleanTextForFilename(baseNameForSeo.substring(0, 70));

  // Use a more distinct part of the original name if available for uniqueness, otherwise a short hash
  const originalIdPart = cleanTextForFilename(originalNameWithoutExtension.substring(0, 30));
  
  // Ensure the index part always has a leading dash if baseNameForSeo or originalIdPart exists
  const indexSuffix = (baseNameForSeo || originalIdPart) ? `-${imageIndex + 1}` : `${imageIndex + 1}`;
  
  // Construct filename: productname-originalfilenamepart-index.webp
  // If originalIdPart is very similar to baseNameForSeo (e.g. baseNameForSeo contains originalIdPart), avoid duplication
  let seoFilename;
  if (baseNameForSeo.includes(originalIdPart) && originalIdPart.length > 5) { // Arbitrary length to avoid trivial inclusions
      seoFilename = `${baseNameForSeo}${indexSuffix}.webp`;
  } else {
      seoFilename = `${baseNameForSeo}${originalIdPart ? '-' + originalIdPart : ''}${indexSuffix}.webp`;
  }

  console.log(`[SeoFilename] Generated: ${seoFilename} (Original: ${originalName}, Product Name: ${productContext?.name}, Base for SEO: ${baseNameForSeo}, Original ID Part: ${originalIdPart}, Index: ${imageIndex})`);
  return seoFilename;
}


function generateSeoMetadataWithTemplate(
  generatedSeoName: string,
  originalFileName: string,
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[],
  imageIndex: number // Index of this image within its product group
): { alt: string; title: string } {
  const originalNameWithoutExtension = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;

  const productName = productContext?.name || originalNameWithoutExtension.replace(/-/g, ' ').replace(/_/g, ' ');
  const categoryInfo = allWooCategoriesCache?.find(c => c.slug === productContext?.category);
  const categoryName = categoryInfo?.name || productContext?.category || '';
  const attributesList = productContext?.attributes?.filter(attr => attr.name && attr.value).map(attr => `${attr.name} ${attr.value}`) || [];
  const attributesSummary = attributesList.join(', ');

  const templateData = {
      nombre_producto: productName,
      nombre_original_sin_extension: originalNameWithoutExtension,
      nombre_archivo_seo: generatedSeoName.replace(/\.webp$/i, ''),
      indice_imagen: String(imageIndex + 1),
      sku: productContext?.sku || '',
      categoria: categoryName,
      palabras_clave: productContext?.keywords || '',
      atributos: attributesSummary,
      precio_regular: productContext?.regularPrice || '',
      precio_oferta: productContext?.salePrice || '',
  };

  // console.log("[SeoMetadata] TemplateData for metadatos_seo:", templateData);

  let altText: string = '';
  // Prioritize category-specific template, then global
  const metaTemplateCategory = templates.find(t =>
      t.type === 'metadatos_seo' &&
      t.scope === 'categoria_especifica' && productContext?.category && t.categoryValue === productContext.category
  );
  const metaTemplateGlobal = templates.find(t => t.type === 'metadatos_seo' && t.scope === 'global');
  const metaTemplate = metaTemplateCategory || metaTemplateGlobal;


  if (metaTemplate && metaTemplate.content) {
    console.log(`[SeoMetadata] Applying 'metadatos_seo' template: "${metaTemplate.name}" (Scope: ${metaTemplate.scope}, Category: ${productContext?.category || 'N/A'}, Content: "${metaTemplate.content.substring(0,50)}...")`);
    altText = applyTemplate(metaTemplate.content, templateData);
  } else {
    console.log("[SeoMetadata] No 'metadatos_seo' template found or applied.");
  }

  // Fallback if template didn't generate alt text or it's too short
  if (!altText || altText.length < 5) { // Arbitrary minimum length
    altText = `${productName}${categoryName ? ' en ' + categoryName : ''}${attributesSummary ? ' - ' + attributesSummary : ''} - Imagen ${imageIndex + 1}`;
    console.log(`[SeoMetadata] Using fallback alt text: "${altText}"`);
  }

  const titleText = altText.length > 100 ? `${altText.substring(0, 97)}...` : altText; // Keep title reasonably short

  console.log(`[SeoMetadata] Generated for ${originalFileName}: alt="${altText}", title="${titleText}"`);
  return {
    alt: altText.substring(0, 125), // Max alt text length often around 125 chars
    title: titleText.substring(0, 200) // WooCommerce title length
  };
}


function applyAutomationRules(
  imageNameWithoutExtension: string, // Can be product name if product context available
  productContext: WizardProductContext | undefined,
  rules: AutomationRule[]
): { assignedCategorySlug?: string; assignedTags: string[] } {
  let categoryToAssignSlug: string | undefined = productContext?.category; // Start with category from context
  const initialTags = productContext?.keywords?.split(',').map(k => k.trim()).filter(k => k) || [];
  const tagsToAssign = new Set<string>(initialTags);

  // Use product name from context if available, otherwise fallback to image name
  const searchableProductName = (productContext?.name || imageNameWithoutExtension).toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');
  const searchableKeywords = (productContext?.keywords || '').toLowerCase();

  console.log(`[Rules] Applying rules for: Name='${searchableProductName}', Keywords='${searchableKeywords}', Initial Category Slug from ProductContext='${categoryToAssignSlug}'`);

  rules.forEach(rule => {
    const ruleKeywordLower = rule.keyword.toLowerCase();
    if (rule.keyword && (searchableProductName.includes(ruleKeywordLower) || searchableKeywords.includes(ruleKeywordLower))) {
      console.log(`[Rules] Match found for rule "${rule.name}" (keyword: "${rule.keyword}")`);
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        // Rule overrides category only if product context didn't have one or rule is more specific
        // For simplicity now, rule always overrides if matched and category is set in rule.
        categoryToAssignSlug = rule.categoryToAssign;
        console.log(`[Rules] Assigning/Overriding category from rule: ${categoryToAssignSlug}`);
      }
      if (rule.tagsToAssign) {
        rule.tagsToAssign.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) {
            tagsToAssign.add(trimmedTag);
            console.log(`[Rules] Adding tag from rule: ${trimmedTag}`);
          }
        });
      }
    }
  });
  console.log(`[Rules] Final assigned category slug: ${categoryToAssignSlug}, Final tags: ${Array.from(tagsToAssign)}`);
  return { assignedCategorySlug: categoryToAssignSlug, assignedTags: Array.from(tagsToAssign) };
}

async function createBatchCompletionNotification(batchId: string, userId: string, isWizardOrBatchWithProducts: boolean, productResults: Array<{name: string, success: boolean, id?: number | string, error?: string }>) {
  if (!adminDb) {
    console.error("[API /api/process-photos] Firestore (adminDb) is not initialized in createBatchCompletionNotification.");
    return;
  }
  try {
    const totalProductsAttempted = productResults.length;
    const successfulProducts = productResults.filter(r => r.success).length;
    const erroredProducts = totalProductsAttempted - successfulProducts;

    let title: string;
    let description: string;
    let type: AppNotification['type'];

    if (isWizardOrBatchWithProducts) { // This will be true for both wizard and batch product creation
      title = `Procesamiento de Productos del Lote ${batchId} Finalizado`;
      if (totalProductsAttempted === 0) {
        description = "No se procesaron productos en este lote.";
        type = 'info';
      } else if (successfulProducts === totalProductsAttempted) {
        description = `Se procesaron ${successfulProducts} producto(s) exitosamente.`;
        type = 'success';
      } else if (erroredProducts === totalProductsAttempted) {
        description = `Falló el procesamiento para los ${erroredProducts} producto(s) del lote.`;
        type = 'error';
      } else {
        description = `Lote procesado: ${successfulProducts} producto(s) con éxito, ${erroredProducts} con errores.`;
        type = 'warning';
      }
    } else { // Fallback case - if somehow productResults is empty but it was a product batch.
      title = `Procesamiento del Lote ${batchId} (Imágenes) Finalizado`;
      description = "Se procesaron las imágenes del lote. Revise el estado para detalles de productos.";
      type = 'info';
    }

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
    console.log(`[API /api/process-photos] Notification created for batch ${batchId} based on product results.`);

  } catch (error) {
    console.error(`[API /api/process-photos] Error creating notification for batch ${batchId}:`, error);
  }
}


async function triggerNextPhotoProcessing(batchId: string, requestUrl: string, userId?: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API /api/process-photos] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}, userId: ${userId || 'N/A (system trigger)'}`);

  // No need to await this, it's a fire-and-forget to trigger the next run
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, userId: userId }), // Pass userId if available for subsequent runs
  }).catch(error => {
    console.error(`[API /api/process-photos] Error self-triggering for batch ${batchId}:`, error);
  });
}


async function updateSpecificFirestoreEntries(
  entryIds: string[],
  status: ProcessingStatusEntry['status'],
  message?: string,
  wooProductId?: number | string
) {
  if (!adminDb) {
    console.error("[Firestore] adminDb is not initialized. Cannot update status for entries:", entryIds);
    return;
  }
  if (entryIds.length === 0) return;

  const firestoreBatch = adminDb.batch();
  entryIds.forEach(entryId => {
    const docRef = adminDb.collection('processing_status').doc(entryId);
    const updateData: any = {
        status: status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (message) updateData.lastMessage = message.substring(0,500); // General message for logging/display
    if (status.startsWith('error_') && message) updateData.errorMessage = message.substring(0, 500);
    if (wooProductId) updateData.productAssociationId = String(wooProductId);
    if (status === 'completed_woocommerce_integration' || status.startsWith('error_woocommerce')) {
        updateData.progress = 100; // Mark as 100% done for UI
    }
    firestoreBatch.update(docRef, updateData);
  });
  await firestoreBatch.commit();
  console.log(`[Firestore] Updated status for ${entryIds.length} specific entries to ${status}. Message: ${message || 'N/A'}. WooProdId: ${wooProductId || 'N/A'}`);
}


async function createOrUpdateWooCommerceProduct(
    request: NextRequest, // For self-triggering URL
    batchId: string,
    userId: string,
    allBatchEntriesReadyForWoo: ProcessingStatusEntry[], // All entries for the batch in 'completed_image_pending_woocommerce'
    templates: ProductTemplate[]
): Promise<Array<{name: string, success: boolean, id?: number | string, error?: string }>> {
  if (!adminDb) {
    console.error("[WooCommerce] Firestore (adminDb) is not initialized.");
    const entryIdsToUpdate = allBatchEntriesReadyForWoo.map(e => e.id);
    await updateSpecificFirestoreEntries(entryIdsToUpdate, 'error_woocommerce_integration', "Server configuration error: Firestore not available.");
    return allBatchEntriesReadyForWoo.map(e => ({name: e.productContext?.name || e.imageName, success: false, error: "Server Firestore error"}));
  }
  if (!wooApi) {
    console.warn("[WooCommerce] API client not initialized. Skipping product creation.");
    const entryIdsToUpdate = allBatchEntriesReadyForWoo.map(e => e.id);
    await updateSpecificFirestoreEntries(entryIdsToUpdate, 'error_woocommerce_integration', "WooCommerce API client not initialized.");
    return allBatchEntriesReadyForWoo.map(e => ({name: e.productContext?.name || e.imageName, success: false, error: "WooCommerce API client error"}));
  }
  
  const productResults: Array<{name: string, success: boolean, id?: number | string, error?: string }> = [];

  // Group entries by productContext.name (this is the key for each product in the batch)
  const productsToProcessMap: Record<string, ProcessingStatusEntry[]> = {};
  allBatchEntriesReadyForWoo.forEach(entry => {
    if (entry.productContext?.name && entry.status === 'completed_image_pending_woocommerce') { // Double check status
      if (!productsToProcessMap[entry.productContext.name]) {
        productsToProcessMap[entry.productContext.name] = [];
      }
      productsToProcessMap[entry.productContext.name].push(entry);
    } else {
      console.warn(`[WooCommerce] Entry ${entry.id} in batch ${batchId} is missing productContext.name or not in correct status. Skipping. Status: ${entry.status}`);
    }
  });

  if (Object.keys(productsToProcessMap).length === 0) {
    console.log(`[WooCommerce] Batch ${batchId}: No products with context found in 'completed_image_pending_woocommerce' state for WooCommerce processing.`);
    return []; // No products were attempted
  }
  
  console.log(`[WooCommerce] Batch ${batchId}: Found ${Object.keys(productsToProcessMap).length} distinct products to process for WooCommerce.`);

  for (const productName in productsToProcessMap) {
    const productEntries = productsToProcessMap[productName]; // All Firestore entries for this specific product
    const primaryEntry = productEntries.find(e => e.productContext?.isPrimary) || productEntries[0];
    let currentProductContext = primaryEntry?.productContext;

    if (!currentProductContext) {
      console.warn(`[WooCommerce] Batch ${batchId}, Product Group ${productName}: Critical - No productContext available. Skipping this product group.`);
      await updateSpecificFirestoreEntries(productEntries.map(e => e.id), 'error_woocommerce_integration', `Critical: No productContext for product group ${productName}`);
      productResults.push({ name: productName, success: false, error: "Missing product context internally." });
      continue;
    }
    console.log(`[WooCommerce] Processing product: "${productName}" (from batch ${batchId}) with ${productEntries.length} image(s). Context from entry ID: ${primaryEntry.id}`);
    
    // Generate SKU if empty (important for batch processing)
    if (!currentProductContext.sku) {
      currentProductContext.sku = `${cleanTextForFilename(currentProductContext.name).substring(0, 20)}-${Date.now().toString().slice(-4)}`;
      console.log(`[WooCommerce - ${productName}] Generated SKU: ${currentProductContext.sku}`);
    }

    const categoryInfoForTemplate = allWooCategoriesCache?.find(c => c.slug === currentProductContext?.category);
    const categoryNameForTemplate = categoryInfoForTemplate?.name || currentProductContext?.category || '';
    const attributesSummaryForTemplate = currentProductContext?.attributes?.filter(attr => attr.name && attr.value).map(attr => `${attr.name} ${attr.value}`).join(', ') || '';

    const templateDataForDesc = {
        nombre_producto: currentProductContext.name,
        categoria: categoryNameForTemplate,
        sku: currentProductContext.sku,
        palabras_clave: currentProductContext.keywords || '',
        atributos: attributesSummaryForTemplate,
        precio_regular: currentProductContext.regularPrice || '0', // Default to '0' if empty
        precio_oferta: currentProductContext.salePrice || '' // Empty if not set
    };
    console.log(`[WooCommerce - ${productName}] TemplateData for descriptions:`, templateDataForDesc);

    let aiGeneratedShortDescription: string | undefined = undefined;
    let aiGeneratedLongDescription: string | undefined = undefined;

    // Attempt AI generation only if product context descriptions are empty
    if (!currentProductContext.shortDescription || !currentProductContext.longDescription) {
      console.log(`[AI Description - ${productName}] Context descriptions empty, attempting to generate with AI.`);
      try {
        const aiInput = {
          productName: templateDataForDesc.nombre_producto,
          categoryName: templateDataForDesc.categoria, // Pass category name, not slug
          keywords: templateDataForDesc.palabras_clave,
          attributesSummary: templateDataForDesc.atributos,
        };
        const aiOutput = await generateProductDescription(aiInput);
        aiGeneratedShortDescription = aiOutput.shortDescription;
        aiGeneratedLongDescription = aiOutput.longDescription;
        if (aiGeneratedShortDescription) console.log(`[AI Description - ${productName}] AI Short Desc:`, aiGeneratedShortDescription.substring(0, 50) + "...");
        if (aiGeneratedLongDescription) console.log(`[AI Description - ${productName}] AI Long Desc:`, aiGeneratedLongDescription.substring(0, 50) + "...");
      } catch (aiError) {
        console.warn(`[AI Description - ${productName}] Error generating descriptions:`, aiError);
      }
    }

    // Determine final short description (Context > AI > Template > Fallback)
    let finalShortDescription = currentProductContext.shortDescription || aiGeneratedShortDescription;
    if (!finalShortDescription) {
      const template = templates.find(t => t.type === 'descripcion_corta' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)));
      if (template?.content) {
          console.log(`[WooCommerce - ${productName}] Applying 'descripcion_corta' template: "${template.name}"`);
          finalShortDescription = applyTemplate(template.content, templateDataForDesc);
      } else {
          console.log(`[WooCommerce - ${productName}] No specific 'descripcion_corta' template. Using fallback.`);
          finalShortDescription = `Descubre ${templateDataForDesc.nombre_producto}. ${templateDataForDesc.palabras_clave ? `Ideal para ${templateDataForDesc.palabras_clave}.` : '' }`;
      }
    }

    // Determine final long description (Context > AI > Template > Fallback)
    let baseLongDescription = currentProductContext.longDescription || aiGeneratedLongDescription;
    if (!baseLongDescription) {
      const template = templates.find(t => t.type === 'descripcion_larga' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext.category)));
      if (template?.content) {
          console.log(`[WooCommerce - ${productName}] Applying 'descripcion_larga' template: "${template.name}"`);
          baseLongDescription = applyTemplate(template.content, templateDataForDesc);
      } else {
          console.log(`[WooCommerce - ${productName}] No specific 'descripcion_larga' template. Using fallback.`);
          baseLongDescription = `Descripción detallada de ${templateDataForDesc.nombre_producto}. ${categoryNameForTemplate ? `Categoría: ${categoryNameForTemplate}.` : ''}`;
      }
    }
    const finalProductDescription = baseLongDescription; // Removed image list concatenation
    console.log(`[WooCommerce - ${productName}] Final Short Desc: "${(finalShortDescription || '').substring(0,50)}...", Final Long Desc: "${(finalProductDescription || '').substring(0,50)}..."`);


    const wooImages = productEntries
      .filter(entry => entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce' && entry.seoMetadata && entry.seoName)
      .map((entry, index) => ({
          src: entry.processedImageDownloadUrl, // URL from quefoto.es
          name: entry.seoName, // The SEO name we want WooCommerce to use
          alt: entry.seoMetadata?.alt || entry.seoName, // Alt text for the image
          position: entry.productContext?.isPrimary ? 0 : index + 1 // Ensure primary is first
      }))
      .sort((a, b) => a.position - b.position); // Sort by position
    // Re-assign position after sort to ensure 0, 1, 2...
    wooImages.forEach((img, idx) => img.position = idx); 
    console.log(`[WooCommerce Images - ${productName}] Payload:`, wooImages.map(img => ({name:img.name, src:img.src.slice(-30), alt:img.alt, pos:img.position})));

    const wooCategoriesPayload: { slug?: string; id?: number }[] = [];
    let categorySlugToUse = currentProductContext.category || primaryEntry.assignedCategorySlug;
    console.log(`[WooCommerce Categories - ${productName}] Attempting to use category slug: "${categorySlugToUse}" (Context: ${currentProductContext.category}, Rules: ${primaryEntry.assignedCategorySlug})`);
    if (categorySlugToUse) {
      const categoryInfo = allWooCategoriesCache?.find(c => c.slug === categorySlugToUse);
      if (categoryInfo) {
          wooCategoriesPayload.push({ id: categoryInfo.id }); // Use ID for assignment
          console.log(`[WooCommerce Categories - ${productName}] Found category "${categoryInfo.name}" (ID: ${categoryInfo.id}) for slug "${categorySlugToUse}". Payload:`, wooCategoriesPayload);
      } else {
          console.warn(`[WooCommerce Categories - ${productName}] Slug "${categorySlugToUse}" NOT FOUND in WooCommerce category cache. Category will not be assigned.`);
      }
    } else {
        console.log(`[WooCommerce Categories - ${productName}] No category slug specified from context or rules.`);
    }
    // console.log(`[WooCommerce Categories - ${productName}] Final payload:`, wooCategoriesPayload);

    const tagsToUse = primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [];
    console.log(`[WooCommerce Tags - ${productName}] Final payload:`, tagsToUse);

    const wooProductData: any = {
      name: currentProductContext.name,
      type: currentProductContext.productType, // Should be 'simple' for batch
      sku: currentProductContext.sku,
      regular_price: String(currentProductContext.regularPrice || '0'),
      description: finalProductDescription,
      short_description: finalShortDescription,
      categories: wooCategoriesPayload,
      tags: tagsToUse,
      images: wooImages,
      meta_data: [
          { key: '_wooautomate_batch_id', value: batchId },
          { key: '_wooautomate_product_name_in_batch', value: productName}, // Original product name key from batch
          { key: '_external_image_urls', value: productEntries.map(e => e.processedImageDownloadUrl).filter(url => !!url) }
      ]
    };
    if (currentProductContext.salePrice) wooProductData.sale_price = String(currentProductContext.salePrice);
    // For 'simple' products, attributes are for display. For 'variable', they define variations.
    // The batch process currently defaults to 'simple'.
    if (currentProductContext.attributes && currentProductContext.attributes.length > 0 && currentProductContext.attributes.some(attr => attr.name && attr.value)) {
      wooProductData.attributes = currentProductContext.attributes
          .filter(attr => attr.name && attr.value)
          .map((attr, index) => ({
              name: attr.name, options: attr.value.split('|').map(o => o.trim()), // Options is an array for Woo
              position: index, visible: true, variation: currentProductContext.productType === 'variable' // Variation true if variable product
          }));
    }
    
    let finalWooProductId: number | string | null = null;
    let finalErrorMessage: string | null = null;
    let finalSkuUsed: string | null = wooProductData.sku;

    const attemptProductCreation = async (productPayload: any, isRetry: boolean): Promise<{id: number | string | null, skuUsed: string | null, errorMsg?: string}> => {
      let currentSkuAttempt = productPayload.sku;
      try {
        console.log(`[WooCommerce - ${productName}] Attempt #${isRetry ? '2 (retry with new SKU)' : '1'} to create product with SKU: ${currentSkuAttempt}`);
        const response = await wooApi.post("products", productPayload);
        console.log(`[WooCommerce - ${productName}] Product ${response.data.id} processed with SKU: ${currentSkuAttempt}. Woo response status: ${response.status}`);
        return {id: response.data.id, skuUsed: currentSkuAttempt};
      } catch (error: any) {
        const wooErrorMessage = error.response?.data?.message || error.message || "Unknown WooCommerce API error";
        const wooErrorCode = error.response?.data?.code || "";
        console.error(`[WooCommerce - ${productName}] Error (Attempt #${isRetry ? '2' : '1'}) creating product with SKU ${currentSkuAttempt}: ${wooErrorMessage} (Code: ${wooErrorCode}). Woo response status: ${error.response?.status}`);
        
        const isSkuError = (wooErrorMessage.toLowerCase().includes("sku") &&
                           (wooErrorMessage.toLowerCase().includes("duplicate") ||
                            wooErrorMessage.toLowerCase().includes("ya existe") ||
                            wooErrorMessage.toLowerCase().includes("no válido"))) ||
                           wooErrorCode === 'product_invalid_sku' ||
                           wooErrorCode === 'term_exists' || // Sometimes tags/cats can cause this if slugs conflict
                           wooErrorCode === 'woocommerce_product_invalid_sku';

        if (isSkuError && !isRetry) { // Only retry once for SKU errors
          const originalSku = productPayload.sku || `fallback-sku-${Date.now().toString().slice(-3)}`;
          const newSku = `${originalSku}-R${Date.now().toString().slice(-5)}`;
          console.warn(`[WooCommerce - ${productName}] SKU ${originalSku} invalid/duplicate. Retrying with SKU: ${newSku}`);
          const retryProductPayload = { ...productPayload, sku: newSku };
          if (currentProductContext) currentProductContext.sku = newSku; // Update context for potential Firestore save
          
          // Update Firestore entries for this product with the new SKU if retry is successful
          const tempResult = await attemptProductCreation(retryProductPayload, true);
          if (tempResult.id && currentProductContext) { // If retry successful
             const productEntryIdsToUpdateSku = productEntries.map(e => e.id);
             const firestoreUpdateSkuBatch = adminDb.batch();
             productEntryIdsToUpdateSku.forEach(id => {
                firestoreUpdateSkuBatch.update(adminDb.collection('processing_status').doc(id), {
                    'productContext.sku': newSku, // Update SKU in productContext
                    'updatedAt': admin.firestore.FieldValue.serverTimestamp()
                });
             });
             await firestoreUpdateSkuBatch.commit();
             console.log(`[Firestore - ${productName}] Updated SKU to ${newSku} for its entries.`);
          }
          return tempResult;
        }
        // If not an SKU error, or if it's a retry that also failed, return the error.
        return {id: null, skuUsed: currentSkuAttempt, errorMsg: wooErrorMessage};
      }
    };

    const creationResult = await attemptProductCreation(wooProductData, false);
    finalWooProductId = creationResult.id;
    finalSkuUsed = creationResult.skuUsed; // This will be the new SKU if retry happened
    finalErrorMessage = creationResult.errorMsg || null;

    const currentProductEntryIds = productEntries.map(e => e.id);
    if (finalWooProductId) {
      console.log(`[WooCommerce - ${productName}] Product creation successful. Product ID: ${finalWooProductId}. SKU used: ${finalSkuUsed}`);
      console.log(`[QueFoto Delete - ${productName}] Initiating deletion of its processed images from quefoto.es as product created.`);
      for (const entry of productEntries) {
        if (entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce') {
          // Don't await, let it happen in background
          deleteImageFromQueFoto(entry.processedImageDownloadUrl);
        }
      }
      await updateSpecificFirestoreEntries(currentProductEntryIds, 'completed_woocommerce_integration', `Product created/updated: ${finalWooProductId}. SKU: ${finalSkuUsed}`, String(finalWooProductId));
      productResults.push({ name: productName, success: true, id: finalWooProductId });
    } else {
      console.error(`[WooCommerce - ${productName}] Failed to create product. SKU attempted: ${finalSkuUsed}. Error: ${finalErrorMessage}`);
      await updateSpecificFirestoreEntries(currentProductEntryIds, 'error_woocommerce_integration', `WooCommerce Error for ${productName}: ${(finalErrorMessage || "Unknown error after attempts").substring(0,250)}`);
      if (adminDb && userId) {
          await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
              userId, title: `Error al crear producto "${productName}" (Lote: ${batchId})`,
              description: `SKU intentado: ${finalSkuUsed || 'N/A'}. Error: ${(finalErrorMessage || "Error desconocido").substring(0, 200)}`,
              type: 'error', timestamp: admin.firestore.FieldValue.serverTimestamp() as any, isRead: false, linkTo: `/batch?batchId=${batchId}`
          } as Omit<AppNotification, 'id'>);
      }
      productResults.push({ name: productName, success: false, error: finalErrorMessage || "Unknown WooCommerce error" });
    }
  } // End loop for each product in batch

  return productResults;
}


const MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];


export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {};
  try {
    const requestBodyForLog = await request.clone().json().catch(() => ({})); // Clone for logging
    console.log(`[API /api/process-photos] Received POST request. URL: ${request.url}, Body: ${JSON.stringify(requestBodyForLog)}`);

    if (!adminDb || !adminAuth) {
      console.error("[API /api/process-photos] Firebase Admin SDK (Firestore or Auth) is not initialized.");
      return NextResponse.json(
        { error: 'Server configuration error: Firebase Admin SDK not initialized.' },
        { status: 500 }
      );
    }

    body = await request.json(); 
    const { batchId } = body;
    const userIdFromRequest = body.userId; // This might be undefined if triggered by self-call without it

    if (!batchId) {
      console.log("[API /api/process-photos] batchId is required in request body.");
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Processing request for batchId: ${batchId}, userId from request: ${userIdFromRequest || 'N/A'}`);

    // Fetch global data once per batch processing cycle if needed
    if (!allWooCategoriesCache) await fetchWooCommerceCategories(); // Ensure categories are loaded
    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();

    // Process one image if in 'uploaded' state
    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .orderBy(admin.firestore.FieldPath.documentId()) // Ensure consistent order
                                          .limit(1)
                                          .get();

    if (!photosToProcessSnapshot.empty) {
      const photoDoc = photosToProcessSnapshot.docs[0];
      const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
      const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);

      // Determine the index of this photo *within its own product group*
      let imageIndexInProductGroup = 0;
      if (photoData.productContext?.name) {
          const productGroupPhotosSnapshot = await adminDb.collection('processing_status')
                                                .where('batchId', '==', batchId)
                                                .where('productContext.name', '==', photoData.productContext.name)
                                                .orderBy(admin.firestore.FieldPath.documentId()) // Consistent ordering by doc ID
                                                .get();
          imageIndexInProductGroup = productGroupPhotosSnapshot.docs.findIndex(doc => doc.id === photoData.id);
          if (imageIndexInProductGroup === -1) imageIndexInProductGroup = 0; // Fallback if somehow not found (should not happen)
      }
      console.log(`[API /api/process-photos] Starting image processing for: ${photoData.imageName} (Doc ID: ${photoData.id}, Index in its product group: ${imageIndexInProductGroup}) for product "${photoData.productContext?.name}" in batch ${batchId}`);

      try {
        await photoDocRef.update({ status: 'processing_image_started', progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
        if (!photoData.originalDownloadUrl) throw new Error(`Missing originalDownloadUrl for ${photoData.imageName}`);
        const imageBuffer = await downloadImageFromUrl(photoData.originalDownloadUrl);
        await photoDocRef.update({ progress: 15, status: 'processing_image_downloaded', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        if (imageBuffer.length > MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS) throw new Error(`File ${photoData.imageName} exceeds max size.`);
        const type = await fileTypeFromBuffer(imageBuffer);
        if (!type || !ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT.includes(type.mime)) throw new Error(`Invalid file type: ${type?.mime || 'unknown'}`);
        await photoDocRef.update({ progress: 25, status: 'processing_image_validated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        const processedImageBuffer = await sharp(imageBuffer).webp({ quality: 80 }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).withMetadata({}).toBuffer();
        await photoDocRef.update({ progress: 45, status: 'processing_image_optimized', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Use productContext for SEO name generation
        const generatedSeoName = generateSeoFilenameWithTemplate(photoData.imageName as string, photoData.productContext, imageIndexInProductGroup);
        await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Use productContext for SEO metadata generation
        const seoMetadata = generateSeoMetadataWithTemplate(generatedSeoName, photoData.imageName as string, photoData.productContext, allTemplates, imageIndexInProductGroup);
        await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        // Use productContext for applying rules
        const { assignedCategorySlug, assignedTags } = applyAutomationRules((photoData.productContext?.name || photoData.imageName as string), photoData.productContext, allAutomationRules);
        await photoDocRef.update({ progress: 75, assignedCategorySlug: assignedCategorySlug, assignedTags: assignedTags, status: 'processing_image_rules_applied', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        
        const processedImageExternalUrl = await uploadBufferToQueFoto(processedImageBuffer, generatedSeoName, 'image/webp');
        await photoDocRef.update({ progress: 90, status: 'processing_image_reuploaded', processedImageDownloadUrl: processedImageExternalUrl, processedImageStoragePath: processedImageExternalUrl, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        await photoDocRef.update({ status: 'completed_image_pending_woocommerce', progress: 100, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`[API /api/process-photos] Successfully processed ${photoData.imageName}. Status 'completed_image_pending_woocommerce'.`);

      } catch (imageError) {
        console.error(`[API /api/process-photos] Error processing ${photoData.imageName} (Doc ID: ${photoData.id}):`, imageError);
        await photoDocRef.update({ status: 'error_processing_image', errorMessage: imageError instanceof Error ? imageError.message.substring(0,500) : String(imageError).substring(0,500), progress: (photoData.progress || 0), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      }
      // After processing one image, trigger the endpoint again to check for more or finalize.
      // Pass userId if available from original request, so notification uses the correct user.
      await triggerNextPhotoProcessing(batchId, request.url, userIdFromRequest || photoData.userId);
      return NextResponse.json({ message: `Triggered next step for batch ${batchId} after processing ${photoData.imageName}.`, batchId: batchId, processedPhotoId: photoData.id, status: 'triggered_next_image_or_finish' });
    } else {
      // No more images in 'uploaded' state. Time to check if we can create products.
      console.log(`[API /api/process-photos] No photos in 'uploaded' state for batch ${batchId}. Checking overall batch status.`);
      const allBatchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
      if (allBatchEntriesSnapshot.empty) {
        console.log(`[API /api/process-photos] Batch ${batchId} has no Firestore entries.`);
        return NextResponse.json({ message: `Batch ${batchId} has no entries.`, batchId: batchId, status: 'batch_empty' }, { status: 200 });
      }

      const allEntries = allBatchEntriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      // Determine userId for notifications from first entry or the one passed in request (if available)
      const userIdForNotification = userIdFromRequest || allEntries[0]?.userId || 'fallback_user_id_notification';
      
      const entriesReadyForWooCommerce = allEntries.filter(e => e.status === 'completed_image_pending_woocommerce' && e.productContext?.name);

      if (entriesReadyForWooCommerce.length > 0) {
          console.log(`[API /api/process-photos] Batch ${batchId}: ${entriesReadyForWooCommerce.length} image entries are ready for WooCommerce product creation/update.`);
          
          const productCreationResults = await createOrUpdateWooCommerceProduct(request, batchId, userIdForNotification, entriesReadyForWooCommerce, allTemplates);
          
          console.log(`[API /api/process-photos] Batch ${batchId}: WooCommerce processing complete for ${productCreationResults.length} products. Creating notification.`);
          // Create notification based on the results of all products in the batch
          await createBatchCompletionNotification(batchId, userIdForNotification, true, productCreationResults);
          return NextResponse.json({ message: `Batch ${batchId} WooCommerce processing attempted.`, batchId: batchId, status: 'batch_woocommerce_processing_done', results: productCreationResults }, { status: 200 });
      } else {
          // All images processed, but none are pending WooCommerce with product context, or all already processed/errored.
          const allTerminal = allEntries.every(e => e.status.startsWith('completed_') || e.status.startsWith('error_'));
          if (allTerminal) {
            console.log(`[API /api/process-photos] Batch ${batchId} processing fully terminal. No new products were processed in this run for WooCommerce.`);
            // Create a final notification if it hasn't been done already (e.g., if no products were attempted for Woo)
            // Extract product results from existing terminal states for the notification
             const productResultsForNotification = Object.values(allEntries.reduce((acc, curr) => {
                if (curr.productContext?.name) {
                    if (!acc[curr.productContext.name] || curr.status === 'completed_woocommerce_integration') { // Prioritize success status
                        acc[curr.productContext.name] = {
                            name: curr.productContext.name,
                            success: curr.status === 'completed_woocommerce_integration',
                            id: curr.productAssociationId,
                            error: curr.status.startsWith('error_') ? curr.errorMessage : undefined
                        };
                    }
                }
                return acc;
            }, {} as Record<string, {name: string, success: boolean, id?: number | string, error?: string }>));

            if (productResultsForNotification.length > 0) {
                await createBatchCompletionNotification(batchId, userIdForNotification, true, productResultsForNotification);
            } else {
                // If no products were ever identified (e.g. batch without product context)
                await createBatchCompletionNotification(batchId, userIdForNotification, false, []);
            }
            return NextResponse.json({ message: `Batch ${batchId} processing fully terminal.`, batchId: batchId, status: 'batch_completed_final_check' }, { status: 200 });
          } else {
            console.log(`[API /api/process-photos] Batch ${batchId}: No 'uploaded' photos, not all terminal, and none pending WooCommerce with context. State may be inconsistent or processing very fast.`);
            return NextResponse.json({ message: `Batch ${batchId} in an intermediate or possibly stuck state.`, batchId: batchId, status: 'batch_intermediate_or_stuck' }, { status: 200 });
          }
      }
    }

  } catch (error) {
    console.error(`[API /api/process-photos] General Error in POST for batch ${body?.batchId || 'unknown'}:`, error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown server error occurred during photo processing.';
    // Attempt to mark any non-terminal entries as errored for this batch
    if (adminDb && body?.batchId) {
        try {
            // Query for entries that are not yet in a final (completed/error) state
            const q = adminDb.collection('processing_status')
                .where('batchId', '==', body.batchId);
            const snapshot = await q.get();
            if (!snapshot.empty) {
                const firestoreBatchUpdate = adminDb.batch();
                snapshot.forEach(docToUpdate => {
                    const data = docToUpdate.data();
                    if (data && !data.status.startsWith('completed_') && !data.status.startsWith('error_')) {
                        firestoreBatchUpdate.update(docToUpdate.ref, {
                            status: 'error_processing_image', // General error category
                            errorMessage: `General API error during batch: ${errorMessage.substring(0, 200)}`,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                });
                await firestoreBatchUpdate.commit();
                 console.log(`[API /api/process-photos] Updated status to error for non-terminal entries in batch ${body.batchId} due to general API error.`);
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

    