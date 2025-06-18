
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory, ProductType, ParsedNameData, MiniLMInput, GeneratedProductContent, SeoHistoryEntry } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION, SEO_HISTORY_COLLECTION } from '@/lib/constants';
import axios from 'axios';
import FormDataLib from "form-data"; // Use form-data for Node.js
import { wooApi } from '@/lib/woocommerce';
import path from 'path';
import fs from 'fs/promises'; // For reading local files
import { generateProductDescription } from '@/ai/flows/generate-product-description'; // Genkit flow, might be replaced by MiniLM
import { classifyImage } from '@/ai/services/image-classification'; // MobileNetV2
import { extractProductNameAndAttributesFromFilename } from '@/lib/utils'; // Natural.js (to be implemented further in utils)
import { generateContentWithMiniLM } from '@/ai/services/minilm-text-generation'; // MiniLM service
import { LOCAL_UPLOAD_RAW_DIR_RELATIVE, LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE } from '@/lib/local-storage-constants';

// Helper to upload a local image file to WooCommerce Media
async function uploadImageToWooCommerceMedia(
  localImagePathAbsolute: string, // Absolute path to the processed image file
  filename: string, // Desired filename for WooCommerce
  productName?: string // Optional, for title/alt if not specified elsewhere
): Promise<{ id: number; source_url: string; name: string; alt_text: string } | null> {
  const wooCommerceStoreUrl = process.env.WOOCOMMERCE_STORE_URL;
  const wooCommerceApiKey = process.env.WOOCOMMERCE_API_KEY;
  const wooCommerceApiSecret = process.env.WOOCOMMERCE_API_SECRET;

  if (!wooCommerceStoreUrl || !wooCommerceApiKey || !wooCommerceApiSecret) {
    console.error("[WC Media Upload] WooCommerce API credentials or URL not configured.");
    return null;
  }

  try {
    const fileBuffer = await fs.readFile(localImagePathAbsolute);
    const form = new FormDataLib();
    form.append('file', fileBuffer, filename);
    // You can also append title, alt_text, caption, description to the form if desired
    // form.append('title', productName || filename);
    // form.append('alt_text', `Image of ${productName || filename}`);

    console.log(`[WC Media Upload] Uploading ${filename} (from ${localImagePathAbsolute}) to WooCommerce Media...`);

    const response = await axios.post(
      `${wooCommerceStoreUrl}/wp-json/wc/v3/media`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Basic ${Buffer.from(`${wooCommerceApiKey}:${wooCommerceApiSecret}`).toString('base64')}`
        },
        timeout: 60000, // 60 seconds timeout for media upload
      }
    );

    if (response.data && response.data.id) {
      console.log(`[WC Media Upload] Successfully uploaded ${filename} to WooCommerce. Media ID: ${response.data.id}, URL: ${response.data.source_url}`);
      return {
        id: response.data.id,
        source_url: response.data.source_url,
        name: response.data.name?.raw || filename, // From WC 6.7+ name is an object
        alt_text: response.data.alt_text || `Image of ${productName || filename.split('.')[0]}`
      };
    } else {
      console.error(`[WC Media Upload] Failed to upload ${filename} to WooCommerce. Response:`, response.data);
      return null;
    }
  } catch (error) {
    console.error(`[WC Media Upload] Axios error uploading ${filename} to WooCommerce:`, error);
    if (axios.isAxiosError(error) && error.response) {
        console.error("[WC Media Upload] Axios error response data:", error.response.data);
    }
    return null;
  }
}


// --- Existing helper functions (downloadImageFromUrl, cleanTextForFilename, applyTemplate, etc.) ---
// downloadImageFromUrl might not be needed if images are already local.
// If originalDownloadUrl now refers to a local path, we'll read it with fs.readFile.

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
  // This function might need enhancement if MiniLM prompts use complex template structures
  // For now, keeping the simple placeholder replacement logic.
  let result = templateContent;
  // Handle {{#if variable}}...{{/if}} blocks
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
    const value = data[variableName];
    if (variableName.toLowerCase().includes('price')) { // Treat price '0' or empty as not present for offer
        return (value !== undefined && value !== null && String(value).trim() !== '' && parseFloat(String(value)) > 0) ? innerContent.trim() : '';
    }
    return (value && String(value).trim() !== '' && value !== 0 && value !== false) ? innerContent.trim() : '';
  });

  // Handle simple {{variable}} replacements
  for (const key in data) {
    const placeholder = `{{${key}}}`;
    const value = (data[key] === null || data[key] === undefined) ? '' : String(data[key]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
  // Remove any unfulfilled placeholders
  result = result.replace(/\{\{[\w-.]+\}\}/g, '').trim(); 
  return result;
}


async function getTemplates(): Promise<ProductTemplate[]> {
  if (!adminDb) throw new Error("Server configuration error: Firestore not available for templates.");
  const templatesSnapshot = await adminDb.collection(PRODUCT_TEMPLATES_COLLECTION).get();
  return templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductTemplate));
}

async function getAutomationRules(): Promise<AutomationRule[]> {
  if (!adminDb) throw new Error("Server configuration error: Firestore not available for rules.");
  const rulesSnapshot = await adminDb.collection(AUTOMATION_RULES_COLLECTION).get();
  return rulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationRule));
}

let allWooCategoriesCache: WooCommerceCategory[] | null = null;
async function fetchWooCommerceCategories(): Promise<WooCommerceCategory[]> {
    if (allWooCategoriesCache) return allWooCategoriesCache;
    if (!wooApi) { console.warn("[WooCommerce Categories] API client not initialized."); return []; }
    try {
        const response = await wooApi.get("products/categories", { per_page: 100, orderby: "name", order: "asc" });
        if (response.status === 200 && Array.isArray(response.data)) {
            allWooCategoriesCache = response.data.map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug }));
            return allWooCategoriesCache;
        }
        return [];
    } catch (error) { console.error("[WooCommerce Categories] Error fetching:", error); return []; }
}


function applyAutomationRules(
  parsedNameData: ParsedNameData | undefined,
  visualTags: string[] | undefined,
  productContext: WizardProductContext | undefined,
  rules: AutomationRule[]
): { assignedCategorySlug?: string; assignedTags: string[] } {
  let categoryToAssignSlug: string | undefined = productContext?.category;
  const initialKeywords = productContext?.keywords || parsedNameData?.extractedProductName || '';
  const tagsToAssign = new Set<string>(initialKeywords.split(',').map(k => k.trim()).filter(k => k));
  (visualTags || []).forEach(tag => tagsToAssign.add(tag.replace(/\s+/g, ''))); // Add visual tags

  const searchableText = `${parsedNameData?.normalizedProductName || ''} ${initialKeywords} ${(visualTags || []).join(' ')}`.toLowerCase();
  
  console.log(`[Rules] Applying for: Text='${searchableText.substring(0,100)}...', Initial Category='${categoryToAssignSlug}'`);
  rules.forEach(rule => {
    const ruleKeywordLower = rule.keyword.toLowerCase();
    if (rule.keyword && searchableText.includes(ruleKeywordLower)) {
      console.log(`[Rules] Match for rule "${rule.name}" (keyword: "${rule.keyword}")`);
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssignSlug = rule.categoryToAssign;
        console.log(`[Rules] Assigning category from rule: ${categoryToAssignSlug}`);
      }
      if (rule.tagsToAssign) {
        rule.tagsToAssign.split(',').forEach(tag => {
          const trimmedTag = tag.trim();
          if (trimmedTag) tagsToAssign.add(trimmedTag);
        });
      }
    }
  });
  const finalTags = Array.from(tagsToAssign);
  console.log(`[Rules] Final assigned category: ${categoryToAssignSlug}, Tags: ${finalTags.join(', ')}`);
  return { assignedCategorySlug: categoryToAssignSlug, assignedTags: finalTags };
}

async function logSeoHistory(entry: Omit<SeoHistoryEntry, 'id' | 'processedAt'>) {
  if (!adminDb) {
    console.error("[SEO History] Firestore (adminDb) not initialized. Skipping log.");
    return;
  }
  try {
    await adminDb.collection(SEO_HISTORY_COLLECTION).add({
      ...entry,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`[SEO History] Logged entry for ${entry.originalImageName}`);
  } catch (error) {
    console.error(`[SEO History] Error logging entry for ${entry.originalImageName}:`, error);
  }
}

async function cleanupTempFiles(localFilePaths: string[]) {
  for (const filePath of localFilePaths) {
    try {
      const absolutePath = path.join(process.cwd(), 'public', filePath.startsWith('/') ? filePath.substring(1) : filePath);
      if (await fs.stat(absolutePath).then(() => true).catch(() => false)) {
        await fs.unlink(absolutePath);
        console.log(`[Cleanup] Deleted temporary file: ${absolutePath}`);
      }
    } catch (error) {
      console.warn(`[Cleanup] Error deleting temporary file ${filePath}:`, error);
    }
  }
}


async function createBatchCompletionNotification(batchId: string, userId: string, productResults: Array<{name: string, success: boolean, id?: number | string, error?: string }>) {
  if (!adminDb) return;
  const totalProductsAttempted = productResults.length;
  const successfulProducts = productResults.filter(r => r.success).length;
  const erroredProducts = totalProductsAttempted - successfulProducts;
  let title = `Procesamiento del Lote ${batchId} Finalizado`;
  let description: string;
  let type: AppNotification['type'];

  if (totalProductsAttempted === 0) {
    description = "No se procesaron productos en este lote."; type = 'info';
  } else if (successfulProducts === totalProductsAttempted) {
    description = `Se crearon ${successfulProducts} producto(s) exitosamente.`; type = 'success';
  } else if (erroredProducts === totalProductsAttempted) {
    description = `Falló el procesamiento para los ${erroredProducts} producto(s) del lote.`; type = 'error';
  } else {
    description = `Lote procesado: ${successfulProducts} producto(s) con éxito, ${erroredProducts} con errores.`; type = 'warning';
  }
  await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
    userId, title, description, type,
    timestamp: admin.firestore.FieldValue.serverTimestamp() as any,
    isRead: false, linkTo: `/batch?batchId=${batchId}`
  } as Omit<AppNotification, 'id'>);
}

async function triggerNextPhotoProcessing(batchId: string, requestUrl: string, userId?: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API Trigger] Triggering next photo processing for batch ${batchId} by calling: ${apiUrl}`);
  fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ batchId, userId }), 
  }).catch(error => console.error(`[API Trigger] Error self-triggering for batch ${batchId}:`, error));
}

async function updateSpecificFirestoreEntries(
  entryIds: string[],
  status: ProcessingStatusEntry['status'],
  updateData: Partial<ProcessingStatusEntry> = {}
) {
  if (!adminDb || entryIds.length === 0) return;
  const firestoreBatch = adminDb.batch();
  entryIds.forEach(entryId => {
    const docRef = adminDb.collection('processing_status').doc(entryId);
    firestoreBatch.update(docRef, {
        ...updateData,
        status: status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  await firestoreBatch.commit();
  console.log(`[Firestore Update] Updated status for ${entryIds.length} entries to ${status}. Data:`, updateData);
}


// Main product creation logic for one product group
async function createWooCommerceProductForGroup(
    productNameFromContext: string,
    productEntries: ProcessingStatusEntry[], // All entries for this specific product
    batchId: string,
    userId: string,
    templates: ProductTemplate[],
    rules: AutomationRule[]
): Promise<{name: string, success: boolean, id?: number | string, error?: string }> {
    console.log(`[WC Product Group - ${productNameFromContext}] Starting creation. Entries: ${productEntries.length}`);
    const primaryEntry = productEntries.find(e => e.productContext?.isPrimary) || productEntries[0];
    if (!primaryEntry || !primaryEntry.productContext) {
        await updateSpecificFirestoreEntries(productEntries.map(e => e.id), 'error_woocommerce_integration', { errorMessage: "Missing primary entry or product context."});
        return { name: productNameFromContext, success: false, error: "Missing primary entry or context." };
    }

    let currentProductContext = { ...primaryEntry.productContext }; // Clone to modify
    let generatedContent = primaryEntry.generatedContent; // From previous MiniLM step
    let assignedCategorySlug = primaryEntry.assignedCategorySlug;
    let assignedTags = primaryEntry.assignedTags || [];

    // Ensure SKU exists
    if (!currentProductContext.sku) {
        currentProductContext.sku = `${cleanTextForFilename(currentProductContext.name).substring(0, 20)}-${Date.now().toString().slice(-4)}`;
    }
    console.log(`[WC Product Group - ${productNameFromContext}] SKU: ${currentProductContext.sku}`);

    // Use generated content if available, otherwise try Genkit/Templates as fallback
    let finalShortDescription = currentProductContext.shortDescription || generatedContent?.shortDescription;
    let finalLongDescription = currentProductContext.longDescription || generatedContent?.longDescription;

    // Fallback description generation if MiniLM didn't provide
    if (!finalShortDescription || !finalLongDescription) {
        console.log(`[WC Product Group - ${productNameFromContext}] Descriptions not fully provided by MiniLM or context, attempting Genkit/Template fallback.`);
        try {
            const aiDescInput = {
                productName: currentProductContext.name,
                categoryName: allWooCategoriesCache?.find(c => c.slug === (assignedCategorySlug || currentProductContext.category))?.name,
                keywords: currentProductContext.keywords || assignedTags.join(', '),
                attributesSummary: currentProductContext.attributes?.map(a => `${a.name}: ${a.value}`).join(', '),
            };
            const aiOutput = await generateProductDescription(aiDescInput); // Genkit call
            if (!finalShortDescription && aiOutput.shortDescription) finalShortDescription = aiOutput.shortDescription;
            if (!finalLongDescription && aiOutput.longDescription) finalLongDescription = aiOutput.longDescription;
        } catch (aiError) {
            console.warn(`[WC Product Group - ${productNameFromContext}] Genkit description generation failed:`, aiError);
        }
    }
    // Further fallback to simple templates if still no description
     const templateDataForDesc = {
        nombre_producto: currentProductContext.name,
        categoria: allWooCategoriesCache?.find(c => c.slug === (assignedCategorySlug || currentProductContext.category))?.name || '',
        sku: currentProductContext.sku,
        palabras_clave: currentProductContext.keywords || assignedTags.join(', '),
        atributos: currentProductContext.attributes?.map(a => `${a.name}: ${a.value}`).join(', ') || '',
        precio_regular: currentProductContext.regularPrice || '0',
        precio_oferta: currentProductContext.salePrice || ''
    };
    if (!finalShortDescription) {
        const shortDescTemplate = templates.find(t => t.type === 'descripcion_corta' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (assignedCategorySlug || currentProductContext.category))));
        finalShortDescription = shortDescTemplate ? applyTemplate(shortDescTemplate.content, templateDataForDesc) : `Descubre ${currentProductContext.name}.`;
    }
    if (!finalLongDescription) {
        const longDescTemplate = templates.find(t => t.type === 'descripcion_larga' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (assignedCategorySlug || currentProductContext.category))));
        finalLongDescription = longDescTemplate ? applyTemplate(longDescTemplate.content, templateDataForDesc) : `Descripción detallada de ${currentProductContext.name}.`;
    }
    console.log(`[WC Product Group - ${productNameFromContext}] Final Descriptions: Short="${(finalShortDescription || '').substring(0,30)}...", Long="${(finalLongDescription || '').substring(0,30)}..."`);

    // Prepare images with WooCommerce Media IDs
    const wooImagesPayload: { id: number; alt?: string; name?: string, position?: number }[] = [];
    for (const entry of productEntries) {
        if (entry.wooCommerceMediaId) {
            wooImagesPayload.push({
                id: entry.wooCommerceMediaId,
                alt: entry.generatedContent?.seoMetadata?.alt || entry.seoMetadata?.alt || entry.productContext?.name,
                name: entry.seoName,
                position: entry.productContext?.isPrimary ? 0 : (wooImagesPayload.length +1) // Ensure primary is 0
            });
        }
    }
    wooImagesPayload.sort((a,b) => (a.position || 99) - (b.position || 99)); // Sort by position
    wooImagesPayload.forEach((img, idx) => img.position = idx); // Re-assign sequential position
    console.log(`[WC Product Group - ${productNameFromContext}] WooCommerce Images Payload (Media IDs):`, wooImagesPayload.map(i => ({id: i.id, alt: i.alt?.substring(0,20), pos: i.position})));

    // Categories
    const wooCategoriesForProduct: { id: number }[] = [];
    const catSlugToUse = assignedCategorySlug || currentProductContext.category;
    if (catSlugToUse) {
        const categoryInfo = allWooCategoriesCache?.find(c => c.slug === catSlugToUse);
        if (categoryInfo) wooCategoriesForProduct.push({ id: categoryInfo.id });
        else console.warn(`[WC Product Group - ${productNameFromContext}] Category slug "${catSlugToUse}" not found in cache.`);
    }

    // Tags: use generatedContent.tags or fallback to assignedTags from rules/context
    const tagsToUse = (generatedContent?.tags && generatedContent.tags.length > 0 ? generatedContent.tags : assignedTags).map(tag => ({ name: tag }));

    // Attributes: use generatedContent.attributes or fallback to context attributes
    const attributesToUse = (generatedContent?.attributes && generatedContent.attributes.length > 0 ? generatedContent.attributes : currentProductContext.attributes || [])
        .filter(attr => attr.name && attr.value)
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()), // For variations
            position: index,
            visible: true,
            variation: currentProductContext.productType === 'variable'
        }));

    const wooProductData: any = {
        name: currentProductContext.name,
        type: currentProductContext.productType,
        sku: currentProductContext.sku,
        regular_price: String(currentProductContext.regularPrice || '0'),
        description: finalLongDescription,
        short_description: finalShortDescription,
        categories: wooCategoriesForProduct,
        tags: tagsToUse,
        images: wooImagesPayload, // Uses Media IDs
        attributes: attributesToUse,
        meta_data: [
            { key: '_wooautomate_batch_id', value: batchId },
            { key: '_wooautomate_product_name_in_batch', value: productNameFromContext},
            // Add other generated metadata if needed
            { key: '_seo_title', value: generatedContent?.seoMetadata?.title || productNameFromContext },
            { key: '_seo_description', value: generatedContent?.seoMetadata?.description || finalShortDescription?.substring(0,160) },
        ]
    };
    if (currentProductContext.salePrice) wooProductData.sale_price = String(currentProductContext.salePrice);

    console.log(`[WC Product Group - ${productNameFromContext}] Final Product Data for WC (Summary):`, JSON.stringify({
        name: wooProductData.name, sku: wooProductData.sku, type: wooProductData.type,
        images_count: wooProductData.images?.length, categories_count: wooProductData.categories?.length,
        tags_count: wooProductData.tags?.length, attributes_count: wooProductData.attributes?.length
    }));

    let finalWooProductId: number | string | null = null;
    let finalErrorMessage: string | null = null;
    let finalSkuUsed: string | null = wooProductData.sku;

    // Product creation attempt (with SKU retry logic)
    const attemptProductCreation = async (productPayload: any, isRetry: boolean): Promise<{id: number | string | null, skuUsed: string | null, errorMsg?: string}> => {
        let currentSkuAttempt = productPayload.sku;
        try {
            const response = await wooApi.post("products", productPayload);
            return {id: response.data.id, skuUsed: currentSkuAttempt};
        } catch (error: any) {
            const wooErrorMessage = error.response?.data?.message || error.message || "Unknown WC API error";
            const wooErrorCode = error.response?.data?.code || "";
            console.error(`[WC Product Group - ${productNameFromContext}] Error (Attempt #${isRetry ? '2' : '1'}) SKU ${currentSkuAttempt}: ${wooErrorMessage} (Code: ${wooErrorCode}). Status: ${error.response?.status}`);

            const isSkuError = (wooErrorMessage.toLowerCase().includes("sku") && (wooErrorMessage.toLowerCase().includes("duplicate") || wooErrorMessage.toLowerCase().includes("ya existe") || wooErrorMessage.toLowerCase().includes("no válido"))) || wooErrorCode === 'product_invalid_sku';

            if (isSkuError && !isRetry) {
                const newSku = `${cleanTextForFilename(productPayload.sku || `fallback-sku`).substring(0,15)}-R${Date.now().toString().slice(-5)}`;
                console.warn(`[WC Product Group - ${productNameFromContext}] SKU ${currentSkuAttempt} invalid/duplicate. Retrying with SKU: ${newSku}`);
                const retryProductPayload = { ...productPayload, sku: newSku };
                // Update context SKU for this product group in Firestore entries if retry successful
                const updateResult = await attemptProductCreation(retryProductPayload, true);
                if (updateResult.id && adminDb) {
                    const batchUpdateSku = adminDb.batch();
                    productEntries.forEach(entry => {
                        batchUpdateSku.update(adminDb.collection('processing_status').doc(entry.id), { 'productContext.sku': newSku });
                    });
                    await batchUpdateSku.commit().catch(e => console.error("Error updating SKU in Firestore:", e));
                }
                return updateResult;
            }
            return {id: null, skuUsed: currentSkuAttempt, errorMsg: wooErrorMessage};
        }
    };

    const creationResult = await attemptProductCreation(wooProductData, false);
    finalWooProductId = creationResult.id;
    finalSkuUsed = creationResult.skuUsed;
    finalErrorMessage = creationResult.errorMsg || null;
    
    const entryIdsForThisProduct = productEntries.map(e => e.id);
    if (finalWooProductId) {
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'completed_woocommerce_integration', {
            productAssociationId: String(finalWooProductId),
            progress: 100,
            lastMessage: `Product created/updated: ${finalWooProductId}. SKU: ${finalSkuUsed}`
        });
        await logSeoHistory({
            batchId, originalImageName: primaryEntry.imageName, productName: currentProductContext.name,
            productId: finalWooProductId, seoName: generatedContent?.seoFilenameBase,
            shortDescription: finalShortDescription, longDescription: finalLongDescription,
            seoMetadata: generatedContent?.seoMetadata, tags: generatedContent?.tags,
            attributes: generatedContent?.attributes, category: assignedCategorySlug || currentProductContext.category
        });
        return { name: productNameFromContext, success: true, id: finalWooProductId };
    } else {
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'error_woocommerce_integration', {
            errorMessage: `WooCommerce Error: ${(finalErrorMessage || "Unknown error").substring(0,250)}`,
            progress: 100
        });
        if (adminDb && userId) {
            await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
                userId, title: `Error al crear producto "${productNameFromContext}"`,
                description: `SKU: ${finalSkuUsed || 'N/A'}. Error: ${(finalErrorMessage || "Err desc.").substring(0, 150)}`,
                type: 'error', timestamp: admin.firestore.FieldValue.serverTimestamp() as any, isRead: false, linkTo: `/batch?batchId=${batchId}`
            } as Omit<AppNotification, 'id'>);
        }
        return { name: productNameFromContext, success: false, error: finalErrorMessage || "Unknown WooCommerce error" };
    }
}


// --- Main POST function ---
export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {};
  let currentPhotoDocId: string | null = null; // For error tracking

  try {
    body = await request.clone().json().catch(() => ({})); 
    console.log(`[API /process-photos] Received POST. Batch: ${body.batchId}, User: ${body.userId}`);

    if (!adminDb || !adminAuth) throw new Error("Firebase Admin SDK not initialized.");
    
    const { batchId } = body;
    const userIdFromRequest = body.userId; 
    if (!batchId) return NextResponse.json({ error: 'batchId is required' }, { status: 400 });

    // --- Load shared resources ---
    if (!allWooCategoriesCache) await fetchWooCommerceCategories(); 
    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();

    // --- Process one image if available ---
    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .orderBy(admin.firestore.FieldPath.documentId()) 
                                          .limit(1)
                                          .get();

    if (!photosToProcessSnapshot.empty) {
      const photoDoc = photosToProcessSnapshot.docs[0];
      currentPhotoDocId = photoDoc.id;
      const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
      const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);

      console.log(`[ImgProc - ${photoData.imageName}] Starting. Doc ID: ${photoData.id}`);
      await photoDocRef.update({ status: 'processing_image_started', progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      // 1. Natural.js: Parse filename (already in productContext from batch upload)
      // For robustness, re-parse or use context.
      const parsedNameData = photoData.productContext?.name ? 
        extractProductNameAndAttributesFromFilename(photoData.imageName, photoData.productContext.name) : 
        extractProductNameAndAttributesFromFilename(photoData.imageName);
      await photoDocRef.update({ status: 'processing_image_name_parsed', progress: 10, parsedNameData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] Name parsed:`, parsedNameData);

      // 2. MobileNetV2: Classify image
      const localImageAbsolutePath = path.join(process.cwd(), 'public', photoData.originalDownloadUrl.startsWith('/') ? photoData.originalDownloadUrl.substring(1) : photoData.originalDownloadUrl);
      let imageBuffer: Buffer;
      try {
        imageBuffer = await fs.readFile(localImageAbsolutePath);
      } catch (readError) {
         console.error(`[ImgProc - ${photoData.imageName}] Error reading local file ${localImageAbsolutePath}:`, readError);
         throw new Error(`Failed to read local image file for ${photoData.imageName}.`);
      }

      const visualTags = (await classifyImage(imageBuffer).catch(e => {
          console.warn(`[ImgProc - ${photoData.imageName}] MobileNet classification failed:`, e);
          return [];
      })).slice(0, 5).map(item => item.className.split(',')[0].trim()); // Top 5 primary tags
      await photoDocRef.update({ status: 'processing_image_classified', progress: 25, visualTags, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] Visual tags:`, visualTags);

      // 3. MiniLM: Generate content (placeholder, needs full implementation)
      const miniLMInput: MiniLMInput = {
        productName: parsedNameData?.extractedProductName || photoData.productContext?.name || photoData.imageName.split('.')[0],
        visualTags,
        category: photoData.productContext?.category || allWooCategoriesCache?.find(c => c.slug === photoData.assignedCategorySlug)?.name,
        existingKeywords: photoData.productContext?.keywords,
        existingAttributes: photoData.productContext?.attributes,
      };
      const generatedContent = await generateContentWithMiniLM(miniLMInput); // Implement this service
      await photoDocRef.update({ status: 'processing_image_content_generated', progress: 45, generatedContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] MiniLM content (summary): SEO Base='${generatedContent.seoFilenameBase}', ShortDesc='${generatedContent.shortDescription.substring(0,30)}...'`);

      // 4. Sharp: Optimize image and save with SEO name
      const processedImageDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
      await fs.mkdir(processedImageDir, { recursive: true });
      const seoFilenameWithExt = `${generatedContent.seoFilenameBase}.webp`;
      const processedImageAbsolutePath = path.join(processedImageDir, seoFilenameWithExt);
      const processedImageRelativePath = path.join('/', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId, seoFilenameWithExt).replace(/\\\\/g, '/');
      
      await sharp(imageBuffer).webp({ quality: 80 }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).toFile(processedImageAbsolutePath);
      await photoDocRef.update({
        status: 'processing_image_optimized', progress: 65, 
        seoName: seoFilenameWithExt,
        processedImageStoragePath: processedImageRelativePath,
        processedImageDownloadUrl: processedImageRelativePath,
        seoMetadata: generatedContent.seoMetadata, // Store generated meta here from MiniLM
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[ImgProc - ${photoData.imageName}] Image optimized: ${processedImageRelativePath}`);

      // 5. Apply Automation Rules (Category, Tags)
      // Rules are applied using parsedName, visualTags, and productContext
      // The generatedContent from MiniLM already suggests tags and attributes. Rules can augment/override.
      const ruleApplicationResult = applyAutomationRules(parsedNameData, visualTags, photoData.productContext, allAutomationRules);
      const finalTags = Array.from(new Set([...(generatedContent.tags || []), ...ruleApplicationResult.assignedTags]));
      const finalCategorySlug = ruleApplicationResult.assignedCategorySlug || photoData.productContext?.category; // Rule category takes precedence
      
      await photoDocRef.update({
        status: 'processing_image_rules_applied', progress: 75,
        assignedCategorySlug: finalCategorySlug,
        assignedTags: finalTags,
        // Update attributes in productContext if MiniLM refined them
        'productContext.attributes': generatedContent.attributes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log(`[ImgProc - ${photoData.imageName}] Rules applied. Category: ${finalCategorySlug}, Tags: ${finalTags.join(', ')}`);

      // 6. Upload processed image to WooCommerce Media
      const wcMediaUploadResult = await uploadImageToWooCommerceMedia(processedImageAbsolutePath, seoFilenameWithExt, miniLMInput.productName);
      if (wcMediaUploadResult && wcMediaUploadResult.id) {
        await photoDocRef.update({
            status: 'completed_image_pending_woocommerce', progress: 100, // Changed from reuploaded
            wooCommerceMediaId: wcMediaUploadResult.id,
            'seoMetadata.alt': wcMediaUploadResult.alt_text, // Update with alt from WC if available
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`[ImgProc - ${photoData.imageName}] Uploaded to WC Media. ID: ${wcMediaUploadResult.id}`);
      } else {
        throw new Error(`Failed to upload processed image ${seoFilenameWithExt} to WooCommerce Media.`);
      }
      
      // Cleanup original raw uploaded file (optional, or do at end of batch)
      // await cleanupTempFiles([photoData.originalDownloadUrl]);

      await triggerNextPhotoProcessing(batchId, request.url, userIdFromRequest || photoData.userId);
      return NextResponse.json({ message: `Processed ${photoData.imageName}. Triggered next.`, batchId: batchId, processedPhotoId: photoData.id });
    
    } else { // No more individual photos in 'uploaded' state, try to create products
      console.log(`[API /process-photos] Batch ${batchId}: No photos in 'uploaded' state. Checking for 'completed_image_pending_woocommerce'.`);
      const entriesReadyForWooCommerceSnapshot = await adminDb.collection('processing_status')
                                                      .where('batchId', '==', batchId)
                                                      .where('status', '==', 'completed_image_pending_woocommerce')
                                                      .get();
      
      const entriesReadyForWooCommerce = entriesReadyForWooCommerceSnapshot.docs.map(doc => ({id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      const userIdForBatch = userIdFromRequest || entriesReadyForWooCommerce[0]?.userId || 'batch_user_id';

      if (entriesReadyForWooCommerce.length > 0) {
        console.log(`[API /process-photos] Batch ${batchId}: Found ${entriesReadyForWooCommerce.length} entries ready for WooCommerce product creation.`);
        
        // Group entries by productContext.name
        const productsMap: Record<string, ProcessingStatusEntry[]> = {};
        entriesReadyForWooCommerce.forEach(entry => {
            const productNameKey = entry.productContext?.name || entry.parsedNameData?.extractedProductName || 'UnknownProduct';
            if (!productsMap[productNameKey]) productsMap[productNameKey] = [];
            productsMap[productNameKey].push(entry);
        });

        console.log(`[API /process-photos] Batch ${batchId}: Grouped into ${Object.keys(productsMap).length} distinct products.`);
        const productCreationResults: Array<{name: string, success: boolean, id?: number | string, error?: string }> = [];

        for (const productNameKey in productsMap) {
            const productEntries = productsMap[productNameKey];
            console.log(`[API /process-photos] Batch ${batchId}: Processing product group "${productNameKey}" with ${productEntries.length} images.`);
            const result = await createWooCommerceProductForGroup(productNameKey, productEntries, batchId, userIdForBatch, allTemplates, allAutomationRules);
            productCreationResults.push(result);
            if (result.success) {
                 // Cleanup processed files for this product
                const processedPathsToDelete = productEntries
                    .map(e => e.processedImageStoragePath)
                    .filter(p => !!p) as string[];
                await cleanupTempFiles(processedPathsToDelete);
            }
        }
        
        await createBatchCompletionNotification(batchId, userIdForBatch, productCreationResults);
        // Cleanup all original raw files for the batch now that all products are attempted
        const allBatchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
        const rawPathsToDelete = allBatchEntriesSnapshot.docs
            .map(doc => (doc.data() as ProcessingStatusEntry).originalDownloadUrl)
            .filter(p => !!p) as string[];
        await cleanupTempFiles(rawPathsToDelete);

        return NextResponse.json({ message: `Batch ${batchId} WooCommerce processing attempted.`, results: productCreationResults });

      } else {
        const allBatchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
        const allTerminal = allBatchEntriesSnapshot.docs.every(doc => {
            const status = doc.data().status;
            return status.startsWith('completed_') || status.startsWith('error_');
        });
        if (allTerminal && !allBatchEntriesSnapshot.empty) {
            console.log(`[API /process-photos] Batch ${batchId} processing fully terminal. No new products created in this run.`);
            // Potentially create a "summary" notification if not already done by individual product completion.
             return NextResponse.json({ message: `Batch ${batchId} processing fully terminal.`, status: 'batch_completed_final_check' });
        }
        console.log(`[API /process-photos] Batch ${batchId}: No images pending processing and not all terminal, or batch empty.`);
        return NextResponse.json({ message: `Batch ${batchId} has no image entries pending or is empty.` });
      }
    }

  } catch (error: any) {
    console.error(`[API /process-photos] General Error. Batch: ${body?.batchId || 'unknown'}, PhotoDoc: ${currentPhotoDocId || 'N/A'}. Error:`, error);
    const errorMessage = error.message || 'An unknown server error occurred.';
    if (adminDb && currentPhotoDocId) { // Update specific photo if error happened during its processing
        await adminDb.collection('processing_status').doc(currentPhotoDocId).update({
            status: 'error_processing_image', 
            errorMessage: `API Error: ${errorMessage.substring(0, 200)}`,
            progress: 0, // Reset progress or set to last known good
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }).catch(e => console.error("Error updating Firestore on general error:", e));
    } else if (adminDb && body?.batchId) { // If error is more general to the batch
        // Update all non-terminal entries in batch to error status
    }
    return NextResponse.json({ error: 'Failed to process photos.', details: errorMessage.substring(0,500) }, { status: 500 });
  }
}
