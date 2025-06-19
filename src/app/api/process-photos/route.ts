
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
import { generateProductDescription } from '@/ai/flows/generate-product-description'; // Genkit flow
import { classifyImage } from '@/ai/services/image-classification'; // MobileNetV2
import { extractProductNameAndAttributesFromFilename } from '@/lib/utils';
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

    console.log(`[WC Media Upload] Uploading ${filename} (from ${localImagePathAbsolute}) to WooCommerce Media...`);

    const response = await axios.post(
      `${wooCommerceStoreUrl}/wp-json/wc/v3/media`, // Changed from /wp-json/wp/v2/media to /wp-json/wc/v3/media for better WC integration
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Basic ${Buffer.from(`${wooCommerceApiKey}:${wooCommerceApiSecret}`).toString('base64')}`,
          // 'Content-Disposition': `attachment; filename=${filename}` // Recommended by WC docs for media
        },
        timeout: 60000, 
      }
    );

    if (response.data && response.data.id) {
      console.log(`[WC Media Upload] Successfully uploaded ${filename} to WooCommerce. Media ID: ${response.data.id}, URL: ${response.data.source_url}`);
      return {
        id: response.data.id,
        source_url: response.data.source_url,
        name: response.data.name?.raw || response.data.slug || filename, // WooCommerce 6.7+ name is an object
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
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
    const value = data[variableName];
    if (variableName.toLowerCase().includes('price')) { 
        return (value !== undefined && value !== null && String(value).trim() !== '' && parseFloat(String(value)) > 0) ? innerContent.trim() : '';
    }
    return (value && String(value).trim() !== '' && value !== 0 && value !== false) ? innerContent.trim() : '';
  });

  for (const key in data) {
    const placeholder = `{{${key}}}`;
    const value = (data[key] === null || data[key] === undefined) ? '' : String(data[key]);
    result = result.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  }
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
            console.log(`[WooCommerce Categories] Fetched and cached ${allWooCategoriesCache.length} categories.`);
            return allWooCategoriesCache;
        }
        console.warn("[WooCommerce Categories] Failed to fetch categories, response not OK or not an array:", response.status, response.data);
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
  (visualTags || []).forEach(tag => tagsToAssign.add(tag.replace(/\s+/g, ''))); 

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
    const finalUpdateData: Record<string, any> = {
        status: status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    for (const key in updateData) {
        if (updateData[key as keyof ProcessingStatusEntry] !== undefined) {
            finalUpdateData[key] = updateData[key as keyof ProcessingStatusEntry];
        }
    }
    firestoreBatch.update(docRef, finalUpdateData);
  });
  try {
    await firestoreBatch.commit();
    console.log(`[Firestore Update] Updated status for ${entryIds.length} entries to ${status}. Data:`, updateData);
  } catch (error){
      console.error(`[Firestore Update] Error committing batch update for ${entryIds.length} entries to ${status}:`, error);
  }
}


async function createWooCommerceProductForGroup(
    productNameFromContext: string,
    productEntries: ProcessingStatusEntry[], 
    batchId: string,
    userId: string,
    templates: ProductTemplate[],
    rules: AutomationRule[]
): Promise<{name: string, success: boolean, id?: number | string, error?: string }> {
    console.log(`[WooCommerce - ${productNameFromContext}] Starting product group creation. Total image entries: ${productEntries.length}`);
    
    const primaryEntry = productEntries.find(e => e.productContext?.isPrimary) || productEntries[0];
    if (!primaryEntry || !primaryEntry.productContext) {
        console.error(`[WooCommerce - ${productNameFromContext}] CRITICAL: Missing primary entry or product context. Cannot proceed.`);
        await updateSpecificFirestoreEntries(productEntries.map(e => e.id), 'error_woocommerce_integration', { errorMessage: "Datos de contexto del producto primario no encontrados."});
        return { name: productNameFromContext, success: false, error: "Datos de contexto del producto primario no encontrados." };
    }
    console.log(`[WooCommerce - ${productNameFromContext}] Primary entry ID: ${primaryEntry.id}, Image name: ${primaryEntry.imageName}`);

    let currentProductContext = { ...primaryEntry.productContext }; 
    console.log(`[WooCommerce - ${productNameFromContext}] Initial product context from primary entry:`, JSON.stringify(currentProductContext, null, 2));

    // Consolidate generated content: Prefer primary entry's, but could merge across entries if needed.
    // For batch processing, each image in a product group should ideally have the same generatedContent (or it's generated once per product group).
    // We'll assume the primary entry's generatedContent (if it exists from individual image processing) is representative for the product.
    let generatedContent = primaryEntry.generatedContent; 
    if (!generatedContent) {
      console.warn(`[WooCommerce - ${productNameFromContext}] Generated content was missing from primary entry. Attempting to generate it now for the product group.`);
      const miniLMInput: MiniLMInput = {
        productName: currentProductContext.name,
        visualTags: primaryEntry.visualTags || [], // Use primary entry's visual tags
        category: allWooCategoriesCache?.find(c => c.slug === (primaryEntry.assignedCategorySlug || currentProductContext.category))?.name,
        existingKeywords: currentProductContext.keywords,
        existingAttributes: currentProductContext.attributes,
      };
      try {
        generatedContent = await generateContentWithMiniLM(miniLMInput);
        console.log(`[WooCommerce - ${productNameFromContext}] MiniLM content generated for product group. SEO Base='${generatedContent.seoFilenameBase}'`);
      } catch(minilmerror) {
        console.error(`[WooCommerce - ${productNameFromContext}] MiniLM content generation FAILED for product group:`, minilmerror);
        generatedContent = { seoFilenameBase: cleanTextForFilename(currentProductContext.name), shortDescription: "", longDescription: "", seoMetadata: { alt: "", title: ""}, attributes: [], tags: [] }; 
      }
    } else {
      console.log(`[WooCommerce - ${productNameFromContext}] Using existing generatedContent from primary entry. SEO Base='${generatedContent.seoFilenameBase}'`);
    }


    if (!currentProductContext.sku || currentProductContext.sku.trim() === "") {
        currentProductContext.sku = `${cleanTextForFilename(currentProductContext.name).substring(0, 20)}-${Date.now().toString().slice(-4)}`;
        console.log(`[WooCommerce - ${productNameFromContext}] SKU was missing, generated: ${currentProductContext.sku}`);
    } else {
        console.log(`[WooCommerce - ${productNameFromContext}] Using provided SKU: ${currentProductContext.sku}`);
    }

    let finalShortDescription = currentProductContext.shortDescription || generatedContent?.shortDescription;
    let finalLongDescription = currentProductContext.longDescription || generatedContent?.longDescription;

    const templateDataForDesc = {
        nombre_producto: currentProductContext.name,
        categoria: allWooCategoriesCache?.find(c => c.slug === (primaryEntry.assignedCategorySlug || currentProductContext.category))?.name || '',
        sku: currentProductContext.sku,
        palabras_clave: currentProductContext.keywords || (generatedContent?.tags || []).join(', '),
        atributos: (generatedContent?.attributes || currentProductContext.attributes)?.map(a => `${a.name}: ${a.value}`).join(', ') || '',
        precio_regular: currentProductContext.regularPrice || '0',
        precio_oferta: currentProductContext.salePrice || ''
    };

    if (!finalShortDescription || finalShortDescription.trim() === "") {
        console.log(`[WooCommerce - ${productNameFromContext}] Short description missing or empty, attempting Genkit/Template fallback.`);
        try {
            const aiDescInput = {
                productName: currentProductContext.name,
                categoryName: templateDataForDesc.categoria,
                keywords: templateDataForDesc.palabras_clave,
                attributesSummary: templateDataForDesc.atributos,
            };
            const aiOutput = await generateProductDescription(aiDescInput); 
            if (aiOutput.shortDescription) {
                finalShortDescription = aiOutput.shortDescription;
                console.log(`[WooCommerce - ${productNameFromContext}] Genkit generated short description.`);
            }
        } catch (aiError) {
            console.warn(`[WooCommerce - ${productNameFromContext}] Genkit short description generation failed:`, aiError);
        }
        if (!finalShortDescription || finalShortDescription.trim() === "") {
            const shortDescTemplate = templates.find(t => t.type === 'descripcion_corta' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (primaryEntry.assignedCategorySlug || currentProductContext.category))));
            finalShortDescription = shortDescTemplate ? applyTemplate(shortDescTemplate.content, templateDataForDesc) : `Descubre ${currentProductContext.name}.`;
            console.log(`[WooCommerce - ${productNameFromContext}] Using template/fallback for short description.`);
        }
    }

    if (!finalLongDescription || finalLongDescription.trim() === "") {
        console.log(`[WooCommerce - ${productNameFromContext}] Long description missing or empty, attempting Genkit/Template fallback.`);
         try {
            const aiDescInput = {
                productName: currentProductContext.name,
                categoryName: templateDataForDesc.categoria,
                keywords: templateDataForDesc.palabras_clave,
                attributesSummary: templateDataForDesc.atributos,
            };
            const aiOutput = await generateProductDescription(aiDescInput);
            if (aiOutput.longDescription) {
                finalLongDescription = aiOutput.longDescription;
                console.log(`[WooCommerce - ${productNameFromContext}] Genkit generated long description.`);
            }
        } catch (aiError) {
            console.warn(`[WooCommerce - ${productNameFromContext}] Genkit long description generation failed:`, aiError);
        }
        if (!finalLongDescription || finalLongDescription.trim() === "") {
            const longDescTemplate = templates.find(t => t.type === 'descripcion_larga' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (primaryEntry.assignedCategorySlug || currentProductContext.category))));
            finalLongDescription = longDescTemplate ? applyTemplate(longDescTemplate.content, templateDataForDesc) : `Descripción detallada de ${currentProductContext.name}.`;
            console.log(`[WooCommerce - ${productNameFromContext}] Using template/fallback for long description.`);
        }
    }
    console.log(`[WooCommerce - ${productNameFromContext}] Final Descriptions before WC: Short="${(finalShortDescription || '').substring(0,50)}...", Long="${(finalLongDescription || '').substring(0,50)}..."`);

    const wooImagesPayload: { id: number; alt?: string; name?: string, position?: number }[] = [];
    for (const entry of productEntries) { 
        if (entry.wooCommerceMediaId) {
            const altText = entry.generatedContent?.seoMetadata?.alt || entry.seoMetadata?.alt || currentProductContext.name;
            const imageName = entry.seoName || entry.imageName; // Use SEO name if available
            wooImagesPayload.push({
                id: entry.wooCommerceMediaId,
                alt: altText,
                name: imageName,
                position: entry.productContext?.isPrimary ? 0 : (wooImagesPayload.length) // Simpler position logic
            });
             console.log(`[WooCommerce - ${productNameFromContext}] Added image to payload: Media ID ${entry.wooCommerceMediaId}, Alt: ${altText.substring(0,30)}..., Name: ${imageName}, Position: ${entry.productContext?.isPrimary ? 0 : wooImagesPayload.length}`);
        } else {
            console.warn(`[WooCommerce - ${productNameFromContext}] Entry ${entry.id} (Image: ${entry.imageName}) for product missing wooCommerceMediaId. It will not be included.`);
        }
    }
    wooImagesPayload.sort((a,b) => (a.position || 99) - (b.position || 99)); 
    wooImagesPayload.forEach((img, idx) => img.position = idx); 
    console.log(`[WooCommerce - ${productNameFromContext}] Final WooCommerce Images Payload (Media IDs sorted):`, JSON.stringify(wooImagesPayload.map(i => ({id: i.id, alt: i.alt?.substring(0,20), pos: i.position})), null, 2));

    const wooCategoriesForProduct: { id: number }[] = [];
    const catSlugToUse = primaryEntry.assignedCategorySlug || currentProductContext.category;
    if (catSlugToUse) {
        const categoryInfo = allWooCategoriesCache?.find(c => c.slug === catSlugToUse);
        if (categoryInfo) {
             wooCategoriesForProduct.push({ id: categoryInfo.id });
             console.log(`[WooCommerce - ${productNameFromContext}] Assigning category: ID ${categoryInfo.id} (Slug: ${catSlugToUse})`);
        } else {
             console.warn(`[WooCommerce - ${productNameFromContext}] Category slug "${catSlugToUse}" not found in cache. Product will have no category.`);
        }
    } else {
        console.log(`[WooCommerce - ${productNameFromContext}] No category slug to use for product.`);
    }

    const tagsToUse = (generatedContent?.tags && generatedContent.tags.length > 0 ? generatedContent.tags : (primaryEntry.assignedTags || [])).map(tag => ({ name: tag }));
    console.log(`[WooCommerce - ${productNameFromContext}] Tags to use:`, tagsToUse.map(t => t.name).join(', '));

    const attributesToUse = (generatedContent?.attributes && generatedContent.attributes.length > 0 ? generatedContent.attributes : currentProductContext.attributes || [])
        .filter(attr => attr.name && attr.value)
        .map((attr, index) => ({
            name: attr.name,
            options: attr.value.split('|').map(o => o.trim()), 
            position: index,
            visible: true,
            variation: currentProductContext.productType === 'variable'
        }));
    console.log(`[WooCommerce - ${productNameFromContext}] Attributes to use:`, JSON.stringify(attributesToUse.map(a => ({name: a.name, opts_count: a.options.length, var: a.variation})), null, 2));

    const wooProductData: any = {
        name: currentProductContext.name,
        type: currentProductContext.productType,
        sku: currentProductContext.sku,
        regular_price: String(currentProductContext.regularPrice || '0'),
        description: finalLongDescription,
        short_description: finalShortDescription,
        categories: wooCategoriesForProduct,
        tags: tagsToUse,
        images: wooImagesPayload,
        attributes: attributesToUse,
        meta_data: [
            { key: '_wooautomate_batch_id', value: batchId },
            { key: '_wooautomate_product_name_in_batch', value: productNameFromContext},
            { key: '_seo_title', value: generatedContent?.seoMetadata?.title || currentProductContext.name },
            { key: '_seo_description', value: generatedContent?.seoMetadata?.description || finalShortDescription?.substring(0,160) },
        ]
    };
    if (currentProductContext.salePrice && parseFloat(currentProductContext.salePrice) > 0) {
      wooProductData.sale_price = String(currentProductContext.salePrice);
      console.log(`[WooCommerce - ${productNameFromContext}] Sale price set: ${currentProductContext.salePrice}`);
    }

    console.log(`[WooCommerce - ${productNameFromContext}] Final wooProductData (summary) before POST:`, JSON.stringify({
        name: wooProductData.name, sku: wooProductData.sku, type: wooProductData.type,
        reg_price: wooProductData.regular_price, sale_price: wooProductData.sale_price,
        images_count: wooProductData.images?.length, categories_count: wooProductData.categories?.length,
        tags_count: wooProductData.tags?.length, attributes_count: wooProductData.attributes?.length,
        meta_seo_title: wooProductData.meta_data.find((m:any) => m.key === '_seo_title')?.value.substring(0,30)
    }, null, 2));
    
    let finalWooProductId: number | string | null = null;
    let finalErrorMessage: string | null = null;
    let finalSkuUsed: string | null = wooProductData.sku;

    const attemptProductCreation = async (productPayload: any, isRetry: boolean): Promise<{id: number | string | null, skuUsed: string | null, errorMsg?: string}> => {
        let currentSkuAttempt = productPayload.sku;
        try {
            console.log(`[WooCommerce - ${productNameFromContext}] Attempting to POST product to WC. SKU: ${currentSkuAttempt}, Is Retry: ${isRetry}`);
            const response = await wooApi.post("products", productPayload);
            console.log(`[WooCommerce - ${productNameFromContext}] Successfully POSTed product to WC. SKU: ${currentSkuAttempt}, Response ID: ${response.data.id}`);
            return {id: response.data.id, skuUsed: currentSkuAttempt};
        } catch (error: any) {
            const wooErrorMessage = error.response?.data?.message || error.message || "Unknown WC API error";
            const wooErrorCode = error.response?.data?.code || "";
            console.error(`[WooCommerce - ${productNameFromContext}] Error (Attempt #${isRetry ? '2' : '1'}) creating product with SKU ${currentSkuAttempt}: ${wooErrorMessage} (Code: ${wooErrorCode}). WC Response Status: ${error.response?.status}, WC Response Data:`, JSON.stringify(error.response?.data, null, 2));

            const isSkuError = (wooErrorMessage.toLowerCase().includes("sku") && (wooErrorMessage.toLowerCase().includes("duplicate") || wooErrorMessage.toLowerCase().includes("ya existe") || wooErrorMessage.toLowerCase().includes("no válido") || wooErrorMessage.toLowerCase().includes("invalid"))) || wooErrorCode === 'product_invalid_sku' || (error.response?.data?.data?.params?.sku);

            if (isSkuError && !isRetry) {
                const newSku = `${cleanTextForFilename(productPayload.name || `fallback-sku`).substring(0,15)}-R${Date.now().toString().slice(-5)}`;
                console.warn(`[WooCommerce - ${productNameFromContext}] SKU ${currentSkuAttempt} invalid/duplicate. Retrying with new SKU: ${newSku}`);
                const retryProductPayload = { ...productPayload, sku: newSku };
                
                const updateResult = await attemptProductCreation(retryProductPayload, true);
                if (updateResult.id && adminDb) {
                    const batchUpdateSku = adminDb.batch();
                    productEntries.forEach(entry => {
                        const entryDocRef = adminDb.collection('processing_status').doc(entry.id);
                        batchUpdateSku.update(entryDocRef, { 'productContext.sku': newSku, 'updatedAt': admin.firestore.FieldValue.serverTimestamp() });
                    });
                    await batchUpdateSku.commit().catch(e => console.error(`[WooCommerce - ${productNameFromContext}] Error updating SKU to ${newSku} in Firestore for product group:`, e));
                    console.log(`[WooCommerce - ${productNameFromContext}] Firestore SKUs updated to ${newSku} for this product group.`);
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
        console.log(`[WooCommerce - ${productNameFromContext}] Product creation successful. WC ID: ${finalWooProductId}, SKU Used: ${finalSkuUsed}`);
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'completed_woocommerce_integration', {
            productAssociationId: String(finalWooProductId),
            progress: 100,
            lastMessage: `Producto creado/actualizado con ID: ${finalWooProductId}. SKU: ${finalSkuUsed}`
        });
        await logSeoHistory({
            batchId, originalImageName: primaryEntry.imageName, productName: currentProductContext.name,
            productId: finalWooProductId, seoName: generatedContent?.seoFilenameBase,
            shortDescription: finalShortDescription, longDescription: finalLongDescription,
            seoMetadata: generatedContent?.seoMetadata, tags: generatedContent?.tags,
            attributes: generatedContent?.attributes, category: primaryEntry.assignedCategorySlug || currentProductContext.category
        });
        return { name: productNameFromContext, success: true, id: finalWooProductId };
    } else {
        console.error(`[WooCommerce - ${productNameFromContext}] Product creation FAILED. SKU Attempted: ${finalSkuUsed}. Error: ${finalErrorMessage}`);
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'error_woocommerce_integration', {
            errorMessage: `Error WooCommerce: ${(finalErrorMessage || "Error desconocido").substring(0,250)}`,
            progress: 100 
        });
        if (adminDb && userId) {
            await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
                userId, title: `Error al crear producto "${productNameFromContext}"`,
                description: `SKU: ${finalSkuUsed || 'N/A'}. Error: ${(finalErrorMessage || "Error desconocido.").substring(0, 150)}`,
                type: 'error', timestamp: admin.firestore.FieldValue.serverTimestamp() as any, isRead: false, linkTo: `/batch?batchId=${batchId}`
            } as Omit<AppNotification, 'id'>);
        }
        return { name: productNameFromContext, success: false, error: finalErrorMessage || "Unknown WooCommerce error" };
    }
}


export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {};
  let currentPhotoDocId: string | null = null; 

  try {
    body = await request.clone().json().catch(() => ({})); 
    console.log(`[API /process-photos] Received POST. Batch: ${body.batchId}, User: ${body.userId}`);

    if (!adminDb || !adminAuth) {
      console.error("[API /process-photos] Firebase Admin SDK not initialized. Aborting.");
      throw new Error("Firebase Admin SDK not initialized.");
    }
    
    const { batchId } = body;
    const userIdFromRequest = body.userId; 
    if (!batchId) {
      console.error("[API /process-photos] batchId is required. Aborting.");
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }

    console.log(`[API /process-photos] Batch ${batchId}: Loading shared resources (categories, templates, rules)...`);
    if (!allWooCategoriesCache) await fetchWooCommerceCategories(); 
    const allTemplates = await getTemplates();
    const allAutomationRules = await getAutomationRules();
    console.log(`[API /process-photos] Batch ${batchId}: Shared resources loaded. Categories: ${allWooCategoriesCache?.length || 0}, Templates: ${allTemplates.length}, Rules: ${allAutomationRules.length}`);

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
      const userIdForThisPhoto = userIdFromRequest || photoData.userId;

      console.log(`[ImgProc - ${photoData.imageName}] Starting processing for doc ID: ${photoData.id}, Batch: ${batchId}`);
      await photoDocRef.update({ status: 'processing_image_started', progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const localImageAbsolutePath = path.join(process.cwd(), 'public', photoData.originalDownloadUrl.startsWith('/') ? photoData.originalDownloadUrl.substring(1) : photoData.originalDownloadUrl);
      let imageBuffer: Buffer;
      try {
        imageBuffer = await fs.readFile(localImageAbsolutePath);
      } catch (readError) {
         console.error(`[ImgProc - ${photoData.imageName}] Error reading local file ${localImageAbsolutePath}:`, readError);
         await photoDocRef.update({ status: 'error_processing_image', errorMessage: `Failed to read local image file: ${readError}`, progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
         throw new Error(`Failed to read local image file ${localImageAbsolutePath} for ${photoData.imageName}.`);
      }
      console.log(`[ImgProc - ${photoData.imageName}] Image buffer loaded from ${localImageAbsolutePath}. Size: ${imageBuffer.length} bytes.`);
      await photoDocRef.update({ status: 'processing_image_downloaded', progress: 10, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      const parsedNameData = photoData.productContext?.name ? 
        extractProductNameAndAttributesFromFilename(photoData.imageName, photoData.productContext.name) : 
        extractProductNameAndAttributesFromFilename(photoData.imageName);
      await photoDocRef.update({ status: 'processing_image_name_parsed', progress: 15, parsedNameData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] Name parsed (Natural.js): Prod='${parsedNameData.extractedProductName}', Attrs='${parsedNameData.potentialAttributes.join(',')}'`);

      const visualTags = (await classifyImage(imageBuffer).catch(e => {
          console.warn(`[ImgProc - ${photoData.imageName}] MobileNet classification failed:`, e);
          return [];
      })).slice(0, 5).map(item => item.className.split(',')[0].trim());
      await photoDocRef.update({ status: 'processing_image_classified', progress: 25, visualTags, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] Visual tags (MobileNetV2): ${visualTags.join(', ')}`);
      
      const miniLMInput: MiniLMInput = {
        productName: parsedNameData?.extractedProductName || photoData.productContext?.name || photoData.imageName.split('.')[0],
        visualTags,
        category: allWooCategoriesCache?.find(c => c.slug === (photoData.assignedCategorySlug || photoData.productContext?.category))?.name || photoData.productContext?.category,
        existingKeywords: photoData.productContext?.keywords,
        existingAttributes: photoData.productContext?.attributes,
      };
      console.log(`[ImgProc - ${photoData.imageName}] Input for MiniLM:`, JSON.stringify(miniLMInput));
      const generatedContent = await generateContentWithMiniLM(miniLMInput);
      await photoDocRef.update({ status: 'processing_image_content_generated', progress: 45, generatedContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`[ImgProc - ${photoData.imageName}] MiniLM content generated (placeholder). SEO Base='${generatedContent.seoFilenameBase}', ShortDesc='${generatedContent.shortDescription?.substring(0,30)}...'`);

      const processedImageDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
      await fs.mkdir(processedImageDir, { recursive: true });
      // Use SEO filename from MiniLM for the processed image
      const seoFilenameWithExt = `${generatedContent.seoFilenameBase || cleanTextForFilename(miniLMInput.productName)}.webp`;
      const processedImageAbsolutePath = path.join(processedImageDir, seoFilenameWithExt);
      const processedImageRelativePath = path.join('/', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId, seoFilenameWithExt).replace(/\\\\/g, '/');
      
      await sharp(imageBuffer).webp({ quality: 80 }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).toFile(processedImageAbsolutePath);
      const updateDataForOptimized: Partial<ProcessingStatusEntry> = {
        status: 'processing_image_optimized', progress: 65, 
        seoName: seoFilenameWithExt, // Use filename from MiniLM
        processedImageStoragePath: processedImageRelativePath,
        processedImageDownloadUrl: processedImageRelativePath, // Now refers to the processed .webp file
        seoMetadata: generatedContent.seoMetadata, // Store SEO metadata from MiniLM
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };
      await photoDocRef.update(updateDataForOptimized);
      console.log(`[ImgProc - ${photoData.imageName}] Image optimized (Sharp) and saved to: ${processedImageRelativePath} as ${seoFilenameWithExt}`);

      const ruleApplicationResult = applyAutomationRules(parsedNameData, visualTags, photoData.productContext, allAutomationRules);
      const finalTags = Array.from(new Set([...(generatedContent.tags || []), ...ruleApplicationResult.assignedTags]));
      const finalCategorySlug = ruleApplicationResult.assignedCategorySlug || photoData.productContext?.category;
      
      const updateDataForRuleApp: Partial<ProcessingStatusEntry> = {
        status: 'processing_image_rules_applied', progress: 75,
        assignedCategorySlug: finalCategorySlug,
        assignedTags: finalTags,
        updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
      };
      if (generatedContent.attributes && generatedContent.attributes.length > 0) {
        updateDataForRuleApp['productContext.attributes'] = generatedContent.attributes; // Update attributes if MiniLM refined them
      }
      await photoDocRef.update(updateDataForRuleApp);
      console.log(`[ImgProc - ${photoData.imageName}] Rules applied. Final Category Slug: ${finalCategorySlug}, Final Tags: ${finalTags.join(', ')}`);

      console.log(`[ImgProc - ${photoData.imageName}] Attempting to upload processed image ${processedImageAbsolutePath} to WooCommerce Media as ${seoFilenameWithExt}`);
      const wcMediaUploadResult = await uploadImageToWooCommerceMedia(processedImageAbsolutePath, seoFilenameWithExt, miniLMInput.productName);
      if (wcMediaUploadResult && wcMediaUploadResult.id) {
        const updateDataForWCMedia: Partial<ProcessingStatusEntry> = {
            status: 'completed_image_pending_woocommerce', progress: 100,
            wooCommerceMediaId: wcMediaUploadResult.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        };
        if(wcMediaUploadResult.alt_text && photoData.seoMetadata) {
            updateDataForWCMedia.seoMetadata = { ...photoData.seoMetadata, alt: wcMediaUploadResult.alt_text };
        } else if (wcMediaUploadResult.alt_text) {
             updateDataForWCMedia.seoMetadata = { alt: wcMediaUploadResult.alt_text };
        }

        await photoDocRef.update(updateDataForWCMedia);
        console.log(`[ImgProc - ${photoData.imageName}] Successfully uploaded to WC Media. Media ID: ${wcMediaUploadResult.id}`);
      } else {
        console.error(`[ImgProc - ${photoData.imageName}] Failed to upload processed image ${seoFilenameWithExt} to WooCommerce Media.`);
        await photoDocRef.update({ status: 'error_processing_image', errorMessage: `Failed to upload ${seoFilenameWithExt} to WC Media.`, progress: 85, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        throw new Error(`Failed to upload processed image ${seoFilenameWithExt} to WooCommerce Media.`);
      }
      
      console.log(`[ImgProc - ${photoData.imageName}] Individual image processing complete. Triggering next photo.`);
      await triggerNextPhotoProcessing(batchId, request.url, userIdForThisPhoto);
      return NextResponse.json({ message: `Processed ${photoData.imageName}. Triggered next.`, batchId: batchId, processedPhotoId: photoData.id });
    
    } else { 
      console.log(`[API /process-photos] Batch ${batchId}: No photos in 'uploaded' state. Checking for entries ready for WooCommerce product creation ('completed_image_pending_woocommerce').`);
      
      const entriesReadyForWooCommerceSnapshot = await adminDb.collection('processing_status')
                                                      .where('batchId', '==', batchId)
                                                      .where('status', '==', 'completed_image_pending_woocommerce')
                                                      .where('productContext.name', '!=', null) 
                                                      .get();
      
      const entriesReadyForWooCommerce = entriesReadyForWooCommerceSnapshot.docs.map(doc => ({id: doc.id, ...doc.data() } as ProcessingStatusEntry));
      const userIdForBatchOverall = userIdFromRequest || entriesReadyForWooCommerce[0]?.userId || 'batch_processing_user';

      if (entriesReadyForWooCommerce.length > 0) {
        console.log(`[API /process-photos] Batch ${batchId}: Found ${entriesReadyForWooCommerce.length} image entries ready for WooCommerce product creation stage.`);
        
        const productsMap: Record<string, ProcessingStatusEntry[]> = {};
        entriesReadyForWooCommerce.forEach(entry => {
            const productNameKey = entry.productContext?.name; 
            if (!productNameKey) {
                console.warn(`[API /process-photos] Batch ${batchId}: Entry ${entry.id} (Image: ${entry.imageName}) is missing productContext.name. It will be skipped for product creation.`);
                updateSpecificFirestoreEntries([entry.id], 'error_woocommerce_integration', { errorMessage: "Contexto de nombre de producto faltante."});
                return; 
            }
            if (!productsMap[productNameKey]) productsMap[productNameKey] = [];
            productsMap[productNameKey].push(entry);
        });

        const numProductsToCreate = Object.keys(productsMap).length;
        console.log(`[API /process-photos] Batch ${batchId}: Grouped into ${numProductsToCreate} distinct products for creation.`);
        const productCreationResults: Array<{name: string, success: boolean, id?: number | string, error?: string }> = [];

        if (numProductsToCreate > 0) {
            for (const productNameKey in productsMap) {
                const productEntries = productsMap[productNameKey];
                console.log(`[API /process-photos] Batch ${batchId}: Processing product group "${productNameKey}" which has ${productEntries.length} image(s).`);
                const result = await createWooCommerceProductForGroup(productNameKey, productEntries, batchId, userIdForBatchOverall, allTemplates, allAutomationRules);
                productCreationResults.push(result);

                if (result.success) {
                    const processedPathsToDelete = productEntries
                        .map(e => e.processedImageStoragePath)
                        .filter(p => !!p) as string[];
                    await cleanupTempFiles(processedPathsToDelete); // Clean processed for this product
                    const rawPathsForThisProduct = productEntries
                        .map(e => e.originalDownloadUrl)
                        .filter(p => !!p) as string[];
                    await cleanupTempFiles(rawPathsForThisProduct); // Clean raw for this product
                    console.log(`[API /process-photos] Batch ${batchId}: Cleaned up images for product "${productNameKey}".`);
                }
            }
        
            await createBatchCompletionNotification(batchId, userIdForBatchOverall, productCreationResults);
            
            // Check if all entries in the batch are now terminal (completed or errored)
            const allBatchEntriesFinalSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
            const allBatchEntriesFinal = allBatchEntriesFinalSnapshot.docs.map(d => d.data() as ProcessingStatusEntry);
            const isEntireBatchTerminal = allBatchEntriesFinal.every(e => e.status.startsWith('completed_') || e.status.startsWith('error_'));

            if(isEntireBatchTerminal) {
                console.log(`[API /process-photos] Batch ${batchId}: All products processed. Batch complete.`);
                 // Optionally, delete the parent batch folders if they are empty or if it's desired
                const rawBatchDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId);
                const processedBatchDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
                try { await fs.rm(rawBatchDir, { recursive: true, force: true }); console.log(`[Cleanup] Deleted raw batch dir: ${rawBatchDir}`);} catch (e) {console.warn(`[Cleanup] Could not delete raw batch dir ${rawBatchDir}`, e)}
                try { await fs.rm(processedBatchDir, { recursive: true, force: true }); console.log(`[Cleanup] Deleted processed batch dir: ${processedBatchDir}`);} catch (e) {console.warn(`[Cleanup] Could not delete processed batch dir ${processedBatchDir}`,e)}
            }


            return NextResponse.json({ message: `Batch ${batchId} WooCommerce product creation process attempted.`, results: productCreationResults });
        } else {
             console.log(`[API /process-photos] Batch ${batchId}: No valid product groups found to create after filtering. Check for missing productContext.name in entries.`);
             return NextResponse.json({ message: `Batch ${batchId}: No valid product groups found. No products created.`, status: 'batch_completed_no_products_to_create' });
        }

      } else {
        const allBatchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
        if (allBatchEntriesSnapshot.empty) {
             console.log(`[API /process-photos] Batch ${batchId} is empty or all entries have been processed/removed.`);
             return NextResponse.json({ message: `Batch ${batchId} is empty or fully processed.` });
        }
        const allTerminal = allBatchEntriesSnapshot.docs.every(doc => {
            const status = doc.data().status;
            return status.startsWith('completed_') || status.startsWith('error_');
        });

        if (allTerminal && !allBatchEntriesSnapshot.empty) {
            console.log(`[API /process-photos] Batch ${batchId} processing is fully terminal. No new products were created in this run as no images were pending WC integration.`);
             return NextResponse.json({ message: `Batch ${batchId} processing fully terminal. No images were pending WC integration.`, status: 'batch_completed_final_check_no_pending' });
        }
        
        console.log(`[API /process-photos] Batch ${batchId}: No image entries found in 'completed_image_pending_woocommerce' state, and not all entries are terminal, or the batch is empty. Waiting for more images to process or for batch to complete.`);
        return NextResponse.json({ message: `Batch ${batchId} has no image entries pending for product creation or is empty.` });
      }
    }

  } catch (error: any) {
    console.error(`[API /process-photos] CRITICAL ERROR. Batch: ${body?.batchId || 'unknown'}, PhotoDoc being processed: ${currentPhotoDocId || 'N/A'}. Error:`, error.message, error.stack);
    const errorMessage = error.message || 'An unknown server error occurred during photo processing.';
    if (adminDb && currentPhotoDocId) { 
        try {
            await adminDb.collection('processing_status').doc(currentPhotoDocId).update({
                status: 'error_processing_image', 
                errorMessage: `API General Error: ${errorMessage.substring(0, 200)}`,
                progress: 0, 
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (dbError) {
            console.error("[API /process-photos] Firestore update FAILED during CRITICAL ERROR handling for photo doc:", dbError);
        }
    } else if (adminDb && body?.batchId) { 
        console.error(`[API /process-photos] General error for batch ${body.batchId} before specific photo processing started or after.`);
    }
    return NextResponse.json({ error: 'Failed to process photos due to a server error.', details: errorMessage.substring(0,500) }, { status: 500 });
  }
}

    
    