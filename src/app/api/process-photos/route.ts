
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory } from '@/lib/types';
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
      timeout: 30000,
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
     return;
  }

  if (!fileName) {
    console.warn(`[QueFoto Delete] Could not extract filename from URL: ${imageUrl}`);
    return;
  }

  console.log(`[QueFoto Delete] Attempting to delete ${fileName} from quefoto.es (Source URL: ${imageUrl})`);
  try {
    const response = await axios.post(
      "https://quefoto.es/delete.php",
      { fileName: fileName },
      { headers: { "Content-Type": "application/json" }, timeout: 15000 }
    );

    const data = response.data;
    if (data && data.success) {
      console.log(`[QueFoto Delete] Successfully deleted ${fileName} from quefoto.es.`);
    } else {
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
    const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 30000 });
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
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}


function applyTemplate(templateContent: string, data: Record<string, string | number | undefined | null>): string {
  let result = templateContent;

  // Simplified {{#if variable}}...{{/if}} handling
  // This is NOT a full Handlebars parser. It only handles simple presence checks.
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
    const value = data[variableName];
    // Condition is met if value is present, not an empty string, not zero, and not false.
    // For price, even "0" might be a valid value we want to show, so specifically check for undefined/null/empty string for prices.
    if (variableName.toLowerCase().includes('price')) {
        return (value !== undefined && value !== null && String(value).trim() !== '') ? innerContent : '';
    }
    if (value && String(value).trim() !== '' && value !== 0 && value !== false) {
      return innerContent;
    } else {
      return '';
    }
  });

  for (const key in data) {
    const placeholder = `{{${key}}}`;
    const value = (data[key] === null || data[key] === undefined) ? '' : String(data[key]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
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
  imageIndex: number
): string {
  const originalNameWithoutExtension = originalName.substring(0, originalName.lastIndexOf('.')) || originalName;

  let baseNameForSeo = productContext?.name && productContext.name.trim() !== ''
    ? productContext.name
    : originalNameWithoutExtension;

  baseNameForSeo = cleanTextForFilename(baseNameForSeo.substring(0, 70));

  // Use a more distinct part of the original name if available, otherwise a short hash
  const originalIdPart = cleanTextForFilename(originalNameWithoutExtension.substring(0, 30));
  const uniquePart = originalIdPart ? `-${originalIdPart}` : `-${Date.now().toString().slice(-4)}`;

  // Ensure the index part always has a leading dash if baseNameForSeo or uniquePart exists
  const indexSuffix = (baseNameForSeo || uniquePart) ? `-${imageIndex + 1}` : `${imageIndex + 1}`;
  const seoFilename = `${baseNameForSeo}${uniquePart}${indexSuffix}.webp`;

  console.log(`[SeoFilename] Generated: ${seoFilename} (Original: ${originalName}, Product Name: ${productContext?.name}, Base for SEO: ${baseNameForSeo}, Index: ${imageIndex})`);
  return seoFilename;
}


function generateSeoMetadataWithTemplate(
  generatedSeoName: string,
  originalFileName: string,
  productContext: WizardProductContext | undefined,
  templates: ProductTemplate[],
  imageIndex: number
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

  console.log("[SeoMetadata] TemplateData for metadatos_seo:", templateData);

  let altText: string = '';
  const metaTemplateCategory = templates.find(t =>
      t.type === 'metadatos_seo' &&
      t.scope === 'categoria_especifica' && productContext?.category && t.categoryValue === productContext.category
  );
  const metaTemplateGlobal = templates.find(t => t.type === 'metadatos_seo' && t.scope === 'global');
  const metaTemplate = metaTemplateCategory || metaTemplateGlobal;


  if (metaTemplate && metaTemplate.content) {
    console.log(`[SeoMetadata] Applying 'metadatos_seo' template: "${metaTemplate.name}" (Scope: ${metaTemplate.scope}, Content: "${metaTemplate.content}")`);
    altText = applyTemplate(metaTemplate.content, templateData);
  } else {
    console.log("[SeoMetadata] No 'metadatos_seo' template found or applied.");
  }

  if (!altText || altText.length < 5) {
    altText = `${productName}${categoryName ? ' en ' + categoryName : ''}${attributesSummary ? ' - ' + attributesSummary : ''} - Imagen ${imageIndex + 1}`;
    console.log(`[SeoMetadata] Using fallback alt text: "${altText}"`);
  }

  const titleText = altText.length > 100 ? `${altText.substring(0, 97)}...` : altText;

  console.log(`[SeoMetadata] Generated for ${originalFileName}: alt="${altText}", title="${titleText}"`);
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
  let categoryToAssignSlug: string | undefined = productContext?.category;
  const initialTags = productContext?.keywords?.split(',').map(k => k.trim()).filter(k => k) || [];
  const tagsToAssign = new Set<string>(initialTags);

  const searchableProductName = (productContext?.name || imageNameWithoutExtension).toLowerCase().replace(/-/g, ' ').replace(/_/g, ' ');
  const searchableKeywords = (productContext?.keywords || '').toLowerCase();

  console.log(`[Rules] Applying rules for: Name='${searchableProductName}', Keywords='${searchableKeywords}', Initial Category Slug from ProductContext='${categoryToAssignSlug}'`);

  rules.forEach(rule => {
    const ruleKeywordLower = rule.keyword.toLowerCase();
    if (rule.keyword && (searchableProductName.includes(ruleKeywordLower) || searchableKeywords.includes(ruleKeywordLower))) {
      console.log(`[Rules] Match found for rule "${rule.name}" (keyword: "${rule.keyword}")`);
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
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
    const allImageRelatedStatusesDone = successCount + wooSuccessCount + errorCount === totalCount;

    if (isWizard) {
        if (wooSuccessCount > 0) {
            description = `Producto creado/actualizado en WooCommerce. ${wooSuccessCount} imágenes integradas.`;
            if (successCount > 0) description += ` ${successCount} imágenes adicionales procesadas pendientes de integración.`;
        } else if (successCount > 0 && allImageRelatedStatusesDone) {
            description = `Procesamiento de ${successCount} imágenes completo. Hubo un error al integrar con WooCommerce.`;
        } else if (errorCount === totalCount) {
            description = `Todas las ${errorCount} imágenes fallaron durante el procesamiento.`;
        } else {
             description = `Procesamiento en curso o con errores mixtos. ${wooSuccessCount} integradas, ${successCount} procesadas, ${errorCount} errores.`;
        }
         if (errorCount > 0 && (wooSuccessCount > 0 || successCount > 0) && errorCount !== totalCount) {
            description += ` Adicionalmente, ${errorCount} imágenes tuvieron errores de procesamiento.`;
        }
    } else { // Batch flow
        if (wooSuccessCount > 0) {
            description = `Lote procesado. ${wooSuccessCount} productos/imágenes integrados en WooCommerce.`;
        } else if (successCount > 0 && allImageRelatedStatusesDone) { // No Woo success, but image processing done
            description = `Procesamiento de ${successCount} imágenes completo. Error al integrar con WooCommerce o no se configuró contexto de producto.`;
        } else if (errorCount === totalCount) {
            description = `Todas las ${errorCount} imágenes del lote fallaron durante el procesamiento.`;
        } else {
            description = `Procesamiento del lote con estados mixtos. ${successCount} imágenes procesadas, ${wooSuccessCount} integradas, ${errorCount} errores.`;
        }
        if (errorCount > 0 && (wooSuccessCount > 0 || successCount > 0) && errorCount !== totalCount) {
            description += ` Adicionalmente, ${errorCount} imágenes tuvieron errores.`;
        }
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
    body: JSON.stringify({ batchId }), // Only batchId is needed for self-triggering
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
  let currentProductContext = primaryEntry?.productContext;

  if (!currentProductContext) {
    // For batch processing without explicit context from client, try to infer from the first entry
    // This assumes all entries in `productEntries` belong to the same conceptual product for batch mode.
    // If `productContext` was added during `handleStartUploads` in batch/page.tsx, this will be used.
    console.log(`[WooCommerce] No explicit productContext found for primary entry of batch ${batchId}.`);
    // If it's still undefined, we cannot proceed to create a meaningful product.
    if (!primaryEntry.productContext) {
        console.log(`[WooCommerce] Critical: No productContext available at all for batch ${batchId}. Skipping WooCommerce product creation.`);
        await updateFirestoreStatusForBatch(batchId, 'completed_image_pending_woocommerce', "Skipped WooCommerce: No product context.");
        return;
    }
    currentProductContext = primaryEntry.productContext;
  }


  console.log(`[WooCommerce] Attempting to create/update product. Context from entry ${primaryEntry.id}:`, currentProductContext);

  const existingProductSnapshot = await adminDb.collection('processing_status')
                                       .where('batchId', '==', batchId)
                                       .where('productAssociationId', '!=', null)
                                       .limit(1)
                                       .get();
  if (!existingProductSnapshot.empty) {
    const existingProductData = existingProductSnapshot.docs[0].data();
    const existingProductId = existingProductData.productAssociationId;
    // Check if the product context name matches. If processing_status entries can belong to different
    // products within the same batchId (due to file naming inference), this check needs refinement.
    // For now, if *any* product is associated with this batchId, we skip creating a new one.
    // This assumes batchId corresponds to ONE product.
    if (existingProductData.productContext?.name === currentProductContext.name || !currentProductContext.name) {
        console.log(`[WooCommerce] Product ${existingProductId} (Name: ${existingProductData.productContext?.name}) seems to be already associated with batch ${batchId}. Skipping creation/update to avoid duplicates for this batch call.`);
        await updateFirestoreStatusForBatch(batchId, 'completed_woocommerce_integration', `Product already processed: ${existingProductId}`, String(existingProductId));
        return;
    }
     console.log(`[WooCommerce] Batch ${batchId} has an existing product ${existingProductId} (Name: ${existingProductData.productContext?.name}), but current context name (${currentProductContext.name}) is different. This might indicate multiple products in one batchId, which needs careful handling.`);
     // This scenario (multiple products per batchID) is not fully handled by current SKU retry or product creation logic.
     // For now, we'll proceed, but it might lead to issues if not intended.
  }


  const categoryInfoForTemplate = allWooCategoriesCache?.find(c => c.slug === currentProductContext?.category);
  const categoryNameForTemplate = categoryInfoForTemplate?.name || currentProductContext?.category || '';
  const attributesSummaryForTemplate = currentProductContext?.attributes?.filter(attr => attr.name && attr.value).map(attr => `${attr.name} ${attr.value}`).join(', ') || '';

  const templateDataForDesc = {
      nombre_producto: currentProductContext?.name || 'Producto sin nombre',
      categoria: categoryNameForTemplate,
      sku: currentProductContext?.sku || 'N/A',
      palabras_clave: currentProductContext?.keywords || '',
      atributos: attributesSummaryForTemplate,
      precio_regular: currentProductContext?.regularPrice || '0',
      precio_oferta: currentProductContext?.salePrice || ''
  };
  console.log("[WooCommerce] TemplateData for descriptions (placeholders & AI):", templateDataForDesc);

  let aiGeneratedShortDescription: string | undefined = undefined;
  let aiGeneratedLongDescription: string | undefined = undefined;

  if (!currentProductContext?.shortDescription || !currentProductContext?.longDescription) {
    console.log("[AI Description] Attempting to generate descriptions with AI as manual ones are missing or context is from batch.");
    try {
      const aiInput = {
        productName: templateDataForDesc.nombre_producto,
        categoryName: templateDataForDesc.categoria,
        keywords: templateDataForDesc.palabras_clave,
        attributesSummary: templateDataForDesc.atributos,
      };
      const aiOutput = await generateProductDescription(aiInput);
      aiGeneratedShortDescription = aiOutput.shortDescription;
      aiGeneratedLongDescription = aiOutput.longDescription;
      if (aiGeneratedShortDescription) console.log("[AI Description] AI Generated Short Description:", aiGeneratedShortDescription.substring(0, 100) + "...");
      if (aiGeneratedLongDescription) console.log("[AI Description] AI Generated Long Description:", aiGeneratedLongDescription.substring(0, 100) + "...");
    } catch (aiError) {
      console.warn("[AI Description] Error generating product descriptions with AI:", aiError);
    }
  }

  let generatedShortDescription = currentProductContext?.shortDescription || aiGeneratedShortDescription;
  if (!generatedShortDescription) {
    const shortDescTemplateCat = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext?.category);
    const shortDescTemplateGlobal = templates.find(t => t.type === 'descripcion_corta' && t.scope === 'global');
    const shortDescTemplate = shortDescTemplateCat || shortDescTemplateGlobal;
    if (shortDescTemplate && shortDescTemplate.content) {
        console.log(`[WooCommerce] Applying 'descripcion_corta' template: "${shortDescTemplate.name}" (Scope: ${shortDescTemplate.scope})`);
        generatedShortDescription = applyTemplate(shortDescTemplate.content, templateDataForDesc);
    }
  }
  if (!generatedShortDescription) {
      generatedShortDescription = `Descubre ${templateDataForDesc.nombre_producto}. ${templateDataForDesc.palabras_clave ? `Ideal para ${templateDataForDesc.palabras_clave}.` : '' }`;
      console.log(`[WooCommerce] Using fallback short description: "${generatedShortDescription}"`);
  }

  let baseLongDescription = currentProductContext?.longDescription || aiGeneratedLongDescription;
   if (!baseLongDescription) {
    const longDescTemplateCat = templates.find(t => t.type === 'descripcion_larga' && t.scope === 'categoria_especifica' && t.categoryValue === currentProductContext?.category);
    const longDescTemplateGlobal = templates.find(t => t.type === 'descripcion_larga' && t.scope === 'global');
    const longDescTemplate = longDescTemplateCat || longDescTemplateGlobal;
    if (longDescTemplate && longDescTemplate.content) {
        console.log(`[WooCommerce] Applying 'descripcion_larga' template: "${longDescTemplate.name}" (Scope: ${longDescTemplate.scope})`);
        baseLongDescription = applyTemplate(longDescTemplate.content, templateDataForDesc);
    }
  }
  if (!baseLongDescription) {
     baseLongDescription = `Descripción detallada de ${templateDataForDesc.nombre_producto}. ${categoryNameForTemplate ? `Categoría: ${categoryNameForTemplate}.` : ''} ${templateDataForDesc.sku !== 'N/A' ? `SKU: ${templateDataForDesc.sku}.` : ''}`;
     console.log(`[WooCommerce] Using fallback long description: "${baseLongDescription}"`);
  }

  const finalProductDescription = baseLongDescription; // No longer appending image details
  console.log(`[WooCommerce] Final product description to be used: "${finalProductDescription.substring(0,150)}..."`);


  const wooImages = productEntries
    .filter(entry => entry.processedImageDownloadUrl && entry.status === 'completed_image_pending_woocommerce' && entry.seoMetadata && entry.seoName)
    .map((entry, index) => {
        console.log(`[WooCommerce Images] Mapping entry for Woo: seoName (used as image name in Woo):"${entry.seoName}", processedImageDownloadUrl (src for Woo):"${entry.processedImageDownloadUrl}", alt:"${entry.seoMetadata?.alt}"`);
        return {
            src: entry.processedImageDownloadUrl,
            name: entry.seoName, // This name is SUGGESTED to WooCommerce for its media library
            alt: entry.seoMetadata?.alt || entry.seoName,
            position: entry.productContext?.isPrimary ? 0 : index + 1
        };
    })
    .sort((a, b) => a.position - b.position);
  wooImages.forEach((img, idx) => img.position = idx);
  console.log("[WooCommerce Images] Images payload for WooCommerce:", wooImages.map(img => ({name:img.name, src:img.src.slice(-50), alt:img.alt, pos:img.position})));


  const wooCategoriesPayload: { slug?: string; id?: number }[] = [];
  let categorySlugToUse = currentProductContext?.category || primaryEntry.assignedCategorySlug;

  console.log(`[WooCommerce Categories] Initial categorySlugToUse (Wizard/Context: ${currentProductContext?.category}, Rules: ${primaryEntry.assignedCategorySlug}): "${categorySlugToUse}"`);


  if (categorySlugToUse) {
    console.log(`[WooCommerce Categories] Attempting to find category for slug: "${categorySlugToUse}" in cache (total ${allWooCategoriesCache?.length} categories).`);
    const categoryInfo = allWooCategoriesCache?.find(c => c.slug === categorySlugToUse);
    if (categoryInfo) {
        wooCategoriesPayload.push({ id: categoryInfo.id });
        console.log(`[WooCommerce Categories] Valid category "${categoryInfo.name}" (ID: ${categoryInfo.id}, Slug: ${categorySlugToUse}) found and added to payload.`);
    } else {
        console.warn(`[WooCommerce Categories] Category slug "${categorySlugToUse}" was NOT FOUND in fetched WooCommerce categories. It will not be assigned. Check for typos or if the category exists in WooCommerce.`);
    }
  } else {
    console.log("[WooCommerce Categories] No category slug specified in product context or assigned by rules. Product will use default WooCommerce category or be uncategorized.");
  }
  console.log("[WooCommerce Categories] Final categories payload to send to WooCommerce:", wooCategoriesPayload);


  const tagsToUse = primaryEntry.assignedTags && primaryEntry.assignedTags.length > 0 ? primaryEntry.assignedTags.map(tag => ({ name: tag })) : [];
  console.log("[WooCommerce] Final tags payload to send to WooCommerce:", tagsToUse);

  const wooProductData: any = {
    name: currentProductContext?.name || 'Producto Sin Nombre',
    type: currentProductContext?.productType || 'simple',
    sku: currentProductContext?.sku || '',
    regular_price: String(currentProductContext?.regularPrice || '0'),
    description: finalProductDescription,
    short_description: generatedShortDescription,
    categories: wooCategoriesPayload,
    tags: tagsToUse,
    images: wooImages,
    meta_data: [
        { key: '_wooautomate_batch_id', value: batchId },
        { key: '_external_image_urls', value: productEntries.map(e => e.processedImageDownloadUrl).filter(url => !!url) }
    ]
  };

  if (currentProductContext?.salePrice) {
    wooProductData.sale_price = String(currentProductContext.salePrice);
  }
  if (currentProductContext?.attributes && currentProductContext.attributes.length > 0 && currentProductContext.attributes.some(attr => attr.name && attr.value)) {
    wooProductData.attributes = currentProductContext.attributes
        .filter(attr => attr.name && attr.value)
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()),
            position: index,
            visible: true,
            variation: currentProductContext?.productType === 'variable'
        }));
  }
  console.log("[WooCommerce] Full Product data to send (images might be summarized in log):", JSON.stringify(wooProductData, (key, value) => key === 'images' && Array.isArray(value) && value.length > 1 ? `[${value.length} images, first: ${JSON.stringify(value[0])}]` : value, 2));

  let productCreationAttemptedThisRun = false;
  let finalWooProductId: number | string | null = null;
  let finalErrorMessage: string | null = null;
  let finalSkuUsed : string | null = wooProductData.sku;

  const attemptProductCreation = async (productPayload: any, isRetry: boolean): Promise<{id: number | string | null, skuUsed: string | null}> => {
    let currentSkuAttempt = productPayload.sku;
    try {
      console.log(`[WooCommerce] Attempt #${isRetry ? '2 (retry)' : '1'} to create product with SKU: ${currentSkuAttempt}`);
      const response = await wooApi.post("products", productPayload);
      console.log(`[WooCommerce] Product ${response.data.id} processed successfully for batch ${batchId} with SKU: ${currentSkuAttempt}.`);
      return {id: response.data.id, skuUsed: currentSkuAttempt};
    } catch (error: any) {
      const wooErrorMessage = error.response?.data?.message || error.message || "Unknown WooCommerce API error";
      const wooErrorCode = error.response?.data?.code || "";
      console.error(`[WooCommerce] Error (Attempt #${isRetry ? '2' : '1'}) creating product for batch ${batchId} with SKU ${currentSkuAttempt}: ${wooErrorMessage} (Code: ${wooErrorCode})`);

      if (!isRetry && error.response?.data) {
          console.error(`[WooCommerce] Request Data (Attempt #1) that caused error for SKU ${currentSkuAttempt}: ${JSON.stringify(productPayload, null, 2)}`);
          console.error(`[WooCommerce] Error Details from API (Attempt #1) for SKU ${currentSkuAttempt}:`, error.response.data);
      }

      finalErrorMessage = wooErrorMessage;

      const isSkuError = (wooErrorMessage.toLowerCase().includes("sku") &&
                         (wooErrorMessage.toLowerCase().includes("duplicate") ||
                          wooErrorMessage.toLowerCase().includes("ya existe") ||
                          wooErrorMessage.toLowerCase().includes("no válido"))) ||
                         wooErrorCode === 'product_invalid_sku' ||
                         wooErrorCode === 'term_exists' ||
                         wooErrorCode === 'woocommerce_product_invalid_sku';

      console.log(`[WooCommerce] SKU Error Check: isSkuError=${isSkuError}, productCreationAttemptedThisRun=${productCreationAttemptedThisRun}`);

      if (isSkuError && !productCreationAttemptedThisRun && !isRetry) {
        productCreationAttemptedThisRun = true;
        const originalSku = productPayload.sku || `fallback-sku-${Date.now().toString().slice(-3)}`;
        const newSku = `${originalSku}-R${Date.now().toString().slice(-5)}`;
        console.warn(`[WooCommerce] SKU ${originalSku} is invalid or duplicate. Attempting retry with new SKU: ${newSku}`);

        const retryProductPayload = { ...productPayload, sku: newSku };

        // Persist this new SKU to currentProductContext if it exists,
        // so it can be saved to Firestore if the retry is successful.
        if (currentProductContext) {
            currentProductContext.sku = newSku;
             // Also update the primaryEntry's context directly if it's what we're using
            if (primaryEntry && primaryEntry.productContext && primaryEntry.productContext === currentProductContext) {
                 primaryEntry.productContext.sku = newSku;
            }
        }
        return await attemptProductCreation(retryProductPayload, true);
      }
      return {id: null, skuUsed: currentSkuAttempt};
    }
  };

  const creationResult = await attemptProductCreation(wooProductData, false);
  finalWooProductId = creationResult.id;
  finalSkuUsed = creationResult.skuUsed; // This will be the retried SKU if retry happened

  if (finalWooProductId) {
    console.log(`[QueFoto Delete] Initiating deletion of processed images from quefoto.es for product ${finalWooProductId}`);
    for (const entry of productEntries) {
      if (entry.processedImageDownloadUrl &&
          (entry.status === 'completed_image_pending_woocommerce' || entry.status === 'completed_woocommerce_integration') ) {
        await deleteImageFromQueFoto(entry.processedImageDownloadUrl);
      }
    }

    await updateFirestoreStatusForBatch(batchId, 'completed_woocommerce_integration', `Product created/updated: ${finalWooProductId}`, String(finalWooProductId));

    // If SKU was retried and product creation was successful, update Firestore processing_status docs
    if (productCreationAttemptedThisRun && currentProductContext && finalSkuUsed && finalSkuUsed !== wooProductData.sku) {
        console.log(`[Firestore] SKU was retried (new SKU: ${finalSkuUsed}). Updating productContext.sku for batch ${batchId}.`);
        const batchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
        const firestoreBatchUpdate = adminDb.batch();
        batchEntriesSnapshot.forEach(doc => {
            // Only update if the entry's product context name matches the one processed
            // This is a safeguard if a batchId could theoretically have multiple products.
            const entryData = doc.data() as ProcessingStatusEntry;
            if(entryData.productContext?.name === currentProductContext.name) {
                 firestoreBatchUpdate.update(doc.ref, {
                    'productContext.sku': finalSkuUsed, // Use the SKU that was successful
                    'updatedAt': admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });
        await firestoreBatchUpdate.commit();
        console.log(`[Firestore] Successfully updated productContext.sku to ${finalSkuUsed} for relevant entries in batch ${batchId}.`);
    }

  } else {
    await updateFirestoreStatusForBatch(batchId, 'error_woocommerce_integration', `WooCommerce Error: ${(finalErrorMessage || "Unknown error after attempts").substring(0,500)}`);
    if (adminDb && userId) {
        await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
            userId,
            title: `Error al crear producto en WooCommerce (Lote: ${batchId})`,
            description: `SKU intentado: ${finalSkuUsed || 'N/A'}. Error: ${(finalErrorMessage || "Error desconocido").substring(0, 200)}`,
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
  if (batchEntriesSnapshot.empty) {
    console.warn(`[Firestore] No entries found for batch ${batchId} to update status to ${status}.`);
    return;
  }
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
  console.log(`[Firestore] Updated status for all entries in batch ${batchId} to ${status}. Message: ${message || 'N/A'}`);
}

const MAX_FILE_SIZE_BYTES_PROCESS_PHOTOS = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES_PROCESS_PHOTOS_INPUT = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];


export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {};
  try {
    const requestBodyForLog = await request.clone().json().catch(() => ({}));
    console.log(`[API /api/process-photos] Received POST request. URL: ${request.url}, Body: ${JSON.stringify(requestBodyForLog)}`);

    if (!adminDb || !adminAuth) {
      console.error("[API /api/process-photos] Firebase Admin SDK (Firestore or Auth) is not initialized.");
      return NextResponse.json(
        { error: 'Server configuration error: Firebase Admin SDK not initialized.' },
        { status: 500 }
      );
    }

    body = await request.json(); // Now read the original request body
    const { batchId } = body;
    const userIdFromRequest = body.userId;


    if (!batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    console.log(`[API /api/process-photos] Processing request for batchId: ${batchId}, userId from request: ${userIdFromRequest}`);

    await fetchWooCommerceCategories();
    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();


    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .orderBy(admin.firestore.FieldPath.documentId())
                                          .limit(1)
                                          .get();


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
      // isWizardFlow determination should be based on whether ANY entry in the batch has productContext.
      // For a pure batch flow (no wizard), this would be true if productContext was added during handleStartUploads.
      const isWizardOrBatchWithContext = allEntries.some(e => e.productContext && e.productContext.name); // Check for name as a proxy for meaningful context
      const userIdForNotification = userIdFromRequest || allEntries[0]?.userId || 'temp_user_id_fallback_notification';

      const allImageProcessingDone = allEntries.every(
        e => e.status === 'completed_image_pending_woocommerce' ||
             e.status.startsWith('error_processing_image') ||
             e.status === 'completed_woocommerce_integration' ||
             e.status === 'error_woocommerce_integration'
      );

      const needsWooCommerceProcessing = allEntries.some(e => e.status === 'completed_image_pending_woocommerce');

      if (allImageProcessingDone && needsWooCommerceProcessing && isWizardOrBatchWithContext) {
          console.log(`[API /api/process-photos] All images processed for batch ${batchId} (wizard or batch with context). Attempting WooCommerce creation/update.`);

          // Group entries by product name from context if available, to handle multiple products in one batchId
          const productsToProcess: Record<string, ProcessingStatusEntry[]> = {};
          allEntries.forEach(entry => {
            if (entry.productContext?.name && (entry.status === 'completed_image_pending_woocommerce' || entry.status === 'completed_woocommerce_integration')) {
              if (!productsToProcess[entry.productContext.name]) {
                productsToProcess[entry.productContext.name] = [];
              }
              productsToProcess[entry.productContext.name].push(entry);
            }
          });

          for (const productName in productsToProcess) {
            console.log(`[API /api/process-photos] Calling createOrUpdateWooCommerceProduct for product "${productName}" in batch ${batchId}`);
            await createOrUpdateWooCommerceProduct(
              request,
              batchId,
              userIdForNotification,
              productsToProcess[productName],
              allTemplates
            );
          }

          const finalBatchSnapshotAfterWoo = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
          const finalEntriesAfterWoo = finalBatchSnapshotAfterWoo.docs.map(doc => doc.data() as ProcessingStatusEntry);
          if (finalEntriesAfterWoo.every(e => e.status === 'completed_woocommerce_integration' || e.status.startsWith('error_'))) {
             console.log(`[API /api/process-photos] WooCommerce processing and image deletion likely complete for batch ${batchId}. Creating notification.`);
             await createBatchCompletionNotification(batchId, userIdForNotification, isWizardOrBatchWithContext); // Use determined flow type
          } else {
            console.log(`[API /api/process-photos] WooCommerce processing for batch ${batchId} might still have pending steps or errors. Notification will be based on current states.`);
            await createBatchCompletionNotification(batchId, userIdForNotification, isWizardOrBatchWithContext);
          }
          return NextResponse.json({ message: `Batch ${batchId} image processing complete. WooCommerce integration attempted.`, batchId: batchId, status: 'batch_woocommerce_triggered_and_checked' }, { status: 200 });

      } else if (allImageProcessingDone && !needsWooCommerceProcessing) {
          console.log(`[API /api/process-photos] Batch ${batchId} fully complete (no items pending WooCommerce). Creating final notification if needed.`);
          await createBatchCompletionNotification(batchId, userIdForNotification, isWizardOrBatchWithContext);
          return NextResponse.json({ message: `Batch ${batchId} processing fully complete.`, batchId: batchId, status: 'batch_completed_final' }, { status: 200 });

      } else {
          console.log(`[API /api/process-photos] Batch ${batchId}: No 'uploaded' photos, but some tasks might still be pending or it's a batch without product context for Woo creation.`);
          if (!allImageProcessingDone) {
             console.log(`[API /api/process-photos] Batch ${batchId} is still in progress (some images not 'completed_image_pending_woocommerce' or error). No further action taken by this instance.`);
          } else if (allImageProcessingDone && needsWooCommerceProcessing && !isWizardOrBatchWithContext) {
             console.log(`[API /api/process-photos] Batch ${batchId} images processed, but no product context for WooCommerce creation. Marking as 'completed_image_pending_woocommerce'. Manual intervention or different flow needed to create products.`);
             // No notification here, as it's not "complete" from a product creation standpoint for batch flow without context
          }
          return NextResponse.json({ message: `No 'uploaded' photos found for batchId: ${batchId}. Current state: processing ongoing, stalled, or batch awaiting product creation context.`, batchId: batchId, status: 'batch_in_progress_or_stalled' }, { status: 200 });
      }
    }

    const photoDoc = photosToProcessSnapshot.docs[0];
    const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
    const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);


    const allBatchPhotoDocsForIndexQuery = await adminDb.collection('processing_status')
                                                  .where('batchId', '==', batchId)
                                                  .orderBy(admin.firestore.FieldPath.documentId())
                                                  .get();
    const overallPhotoIndex = allBatchPhotoDocsForIndexQuery.docs.findIndex(doc => doc.id === photoData.id);


    console.log(`[API /api/process-photos] Starting processing for image: ${photoData.imageName} (Doc ID: ${photoData.id}, Index in Batch: ${overallPhotoIndex}) in batch ${batchId}`);

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
          overallPhotoIndex >= 0 ? overallPhotoIndex : 0
      );
      console.log(`[API /api/process-photos] SEO Filename generated: ${generatedSeoName} for ${photoData.imageName}`);
      await photoDocRef.update({ progress: 55, seoName: generatedSeoName, status: 'processing_image_seo_named', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[API /api/process-photos] Updated Firestore with seoName: ${generatedSeoName}`);

      const seoMetadata = generateSeoMetadataWithTemplate(
          generatedSeoName,
          photoData.imageName as string,
          photoData.productContext,
          allTemplates,
          overallPhotoIndex >= 0 ? overallPhotoIndex : 0
      );
      await photoDocRef.update({ progress: 65, seoMetadata: seoMetadata, status: 'processing_image_metadata_generated', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[API /api/process-photos] Generated SEO Metadata for Firestore update: Alt='${seoMetadata.alt}', Title='${seoMetadata.title}' for ${photoData.imageName}`);


      const { assignedCategorySlug, assignedTags } = applyAutomationRules(
        (photoData.imageName as string).substring(0, (photoData.imageName as string).lastIndexOf('.')),
        photoData.productContext,
        allAutomationRules
      );
      console.log(`[API /api/process-photos] Rules applied for ${photoData.imageName}: Category Slug='${assignedCategorySlug}', Tags='${assignedTags.join(',')}'`);
      await photoDocRef.update({
        progress: 75,
        assignedCategorySlug: assignedCategorySlug,
        assignedTags: assignedTags,
        status: 'processing_image_rules_applied',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });


      console.log(`[API /api/process-photos] Uploading processed image "${generatedSeoName}" to quefoto.es`);
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

  } catch (error)
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

