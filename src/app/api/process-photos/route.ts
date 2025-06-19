
// src/app/api/process-photos/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb, admin, adminAuth } from '@/lib/firebase-admin';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import type { ProductTemplate, ProcessingStatusEntry, AutomationRule, AppNotification, WizardProductContext, WooCommerceCategory, ProductType, ParsedNameData, MiniLMInput, GeneratedProductContent, SeoHistoryEntry } from '@/lib/types';
import { PRODUCT_TEMPLATES_COLLECTION, AUTOMATION_RULES_COLLECTION, APP_NOTIFICATIONS_COLLECTION, SEO_HISTORY_COLLECTION, DEFAULT_PROMPTS } from '@/lib/constants';
import axios from 'axios';
import FormDataLib from "form-data"; // Use form-data for Node.js
import { wooApi } from '@/lib/woocommerce';
import path from 'path';
import fs from 'fs/promises'; // For reading local files
// import { generateProductDescription } from '@/ai/flows/generate-product-description'; // Genkit flow - TEMPORARILY DISABLED
import { classifyImage } from '@/ai/services/image-classification'; // MobileNetV2 (stubbed)
import { extractProductNameAndAttributesFromFilename } from '@/lib/utils';
// import { generateContentWithMiniLM } from '@/ai/services/minilm-text-generation'; // MiniLM service - TEMPORARILY DISABLED
import { LOCAL_UPLOAD_RAW_DIR_RELATIVE, LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE } from '@/lib/local-storage-constants';

// START: TEMPORARY PLACEHOLDER FUNCTIONS AND DATA
async function generateProductDescription(
  input: any
): Promise<{ shortDescription?: string; longDescription?: string }> {
  // console.warn("[API /process-photos] generateProductDescription (Genkit) is TEMPORARILY DISABLED. Returning placeholders.");
  return {
    shortDescription: `Placeholder short description for ${input.productName}.`,
    longDescription: `Placeholder long description for ${input.productName} including details about category: ${input.categoryName}, keywords: ${input.keywords}, attributes: ${input.attributesSummary}.`,
  };
}

async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  // console.warn(`[API /process-photos] generateContentWithMiniLM (MiniLM) is TEMPORARILY DISABLED. Returning placeholders for ${input.productName}.`);
  const baseName = cleanTextForFilename(input.productName || 'placeholder-product');
  return {
    seoFilenameBase: baseName,
    shortDescription: `Placeholder MiniLM short description for ${input.productName}.`,
    longDescription: `Placeholder MiniLM long description for ${input.productName}.`,
    seoMetadata: {
      alt: `Placeholder alt text for ${input.productName}`,
      title: `Placeholder Title: ${input.productName}`,
      description: `Placeholder meta description for ${input.productName}.`,
    },
    attributes: input.existingAttributes || [{ name: 'Placeholder Attr', value: 'Placeholder Value' }],
    tags: input.existingKeywords?.split(',').map(k => k.trim()).filter(k => k) || ['placeholder-tag'],
  };
}
// END: TEMPORARY PLACEHOLDER FUNCTIONS AND DATA


// Helper to upload a local image file to WooCommerce Media
async function uploadImageToWooCommerceMedia(
  localImagePathAbsolute: string, // Absolute path to the processed image file
  filename: string, // Desired filename for WooCommerce
  productName?: string // Optional, for title/alt if not specified elsewhere
): Promise<{ id: number; source_url: string; name: string; alt_text: string; error?: string, details?: any } | { error: string, details?: any }> {
  const wooCommerceStoreUrl = process.env.WOOCOMMERCE_STORE_URL;
  const wooCommerceApiKey = process.env.WOOCOMMERCE_API_KEY;
  const wooCommerceApiSecret = process.env.WOOCOMMERCE_API_SECRET;

  console.log(`[WC Media Upload - ${filename}] START. Path: ${localImagePathAbsolute}`);
  if (!wooCommerceStoreUrl || !wooCommerceApiKey || !wooCommerceApiSecret) {
    const errorMsg = "[WC Media Upload] WooCommerce API credentials or URL not configured.";
    console.error(errorMsg);
    return { error: errorMsg };
  }
  if (!wooApi) {
    const errorMsg = "[WC Media Upload] WooCommerce API client (wooApi) is not initialized.";
    console.error(errorMsg);
    return { error: errorMsg };
  }

  try {
    const fileBuffer = await fs.readFile(localImagePathAbsolute);
    const form = new FormDataLib();
    form.append('file', fileBuffer, filename);
    // Optional: Add title and alt_text directly if the API supports it (WC REST API for media creation does)
    // form.append('title', `Image of ${productName || filename.split('.')[0]}`);
    // form.append('alt_text', `Detailed image of ${productName || filename.split('.')[0]}`);
    // form.append('caption', `Photo: ${productName || filename.split('.')[0]}`);

    console.log(`[WC Media Upload - ${filename}] Uploading (size ${fileBuffer.length} bytes) to WooCommerce Media...`);
    const uploadStartTime = Date.now();
    const response = await axios.post(
      `${wooCommerceStoreUrl}/wp-json/wp/v2/media`, // Using wp/v2/media for more control
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Basic ${Buffer.from(`${wooCommerceApiKey}:${wooCommerceApiSecret}`).toString('base64')}`,
          // 'Content-Disposition': `attachment; filename=${filename}` // Might be helpful
        },
        timeout: 120000, // 120 seconds timeout
      }
    );
    const uploadEndTime = Date.now();
    console.log(`[WC Media Upload - ${filename}] Axios POST finished. Time: ${uploadEndTime - uploadStartTime}ms. Status: ${response.status}`);

    if (response.data && response.data.id) {
      console.log(`[WC Media Upload - ${filename}] Successfully uploaded. Media ID: ${response.data.id}, URL: ${response.data.source_url}`);
      console.log(`[WC Media Upload - ${filename}] END - Success`);
      return {
        id: response.data.id,
        source_url: response.data.source_url,
        name: response.data.slug || filename, // slug is often the filename part
        alt_text: response.data.alt_text || `Image of ${productName || filename.split('.')[0]}`
      };
    } else {
      const errorMsg = `[WC Media Upload - ${filename}] Failed to upload. Invalid response data.`;
      console.error(errorMsg, 'Response Data (first 200 chars):', JSON.stringify(response.data)?.substring(0,200));
      console.log(`[WC Media Upload - ${filename}] END - Failure (Invalid Response Data)`);
      return { error: "Failed to upload image to WooCommerce: Invalid response data.", details: response.data };
    }
  } catch (error: any) {
    let wcErrorMessage = "Unknown Axios error during media upload";
    let wcErrorDetails:any = null;
    console.error(`[WC Media Upload - ${filename}] Axios error uploading:`, error.message);
    if (axios.isAxiosError(error)) {
        if (error.response) {
            console.error(`[WC Media Upload - ${filename}] Axios error response status: ${error.response.status}`);
            console.error(`[WC Media Upload - ${filename}] Axios error response data:`, error.response.data); // Log full data
            wcErrorDetails = error.response.data;
            if (typeof error.response.data === 'object' && error.response.data !== null) {
                wcErrorMessage = (error.response.data as any).message || JSON.stringify(error.response.data);
            } else if (typeof error.response.data === 'string') {
                wcErrorMessage = error.response.data;
            }
        } else if (error.request) {
            console.error(`[WC Media Upload - ${filename}] Axios error: No response received.`);
            wcErrorMessage = "No response from WooCommerce media server.";
        }
    }
    console.log(`[WC Media Upload - ${filename}] END - Failure (Axios Error)`);
    return { error: wcErrorMessage, details: wcErrorDetails };
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
  if (!adminDb) {
      // console.warn("[API /process-photos] getTemplates: adminDb not available. Returning empty array.");
      return [];
  }
  const templatesSnapshot = await adminDb.collection(PRODUCT_TEMPLATES_COLLECTION).get();
  return templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductTemplate));
}

async function getAutomationRules(): Promise<AutomationRule[]> {
  if (!adminDb) {
    // console.warn("[API /process-photos] getAutomationRules: adminDb not available. Returning empty array.");
    return [];
  }
  const rulesSnapshot = await adminDb.collection(AUTOMATION_RULES_COLLECTION).get();
  return rulesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationRule));
}

let allWooCategoriesCache: WooCommerceCategory[] | null = null;
let lastCategoryFetchAttempt = 0;
const CATEGORY_FETCH_COOLDOWN = 5 * 60 * 1000; // 5 minutes

async function fetchWooCommerceCategories(forceRefresh: boolean = false): Promise<WooCommerceCategory[]> {
    const now = Date.now();
    if (!forceRefresh && allWooCategoriesCache && allWooCategoriesCache.length > 0 && (now - lastCategoryFetchAttempt < CATEGORY_FETCH_COOLDOWN)) {
        // console.log("[WooCommerce Categories] Using cached categories.");
        return allWooCategoriesCache;
    }
    if (!wooApi) { console.warn("[WooCommerce Categories] API client not initialized. Cannot fetch."); return allWooCategoriesCache || []; }

    console.log(`[WooCommerce Categories] Attempting to fetch categories from WooCommerce (Force refresh: ${forceRefresh}).`);
    lastCategoryFetchAttempt = now;
    try {
        const response = await wooApi.get("products/categories", { per_page: 100, orderby: "name", order: "asc" });
        if (response.status === 200 && Array.isArray(response.data)) {
            allWooCategoriesCache = response.data.map((cat: any) => ({ id: cat.id, name: cat.name, slug: cat.slug }));
            console.log(`[WooCommerce Categories] Fetched and cached ${allWooCategoriesCache.length} categories.`);
            return allWooCategoriesCache;
        }
        console.warn("[WooCommerce Categories] Failed to fetch categories, response not OK or not an array. Status:", response.status, "Data (first 100 chars):", response.data ? String(response.data).substring(0,100) + '...' : 'N/A');
        return allWooCategoriesCache || []; // Return old cache on failure if exists
    } catch (error: any) {
        console.error("[WooCommerce Categories] Error fetching:", error.message || error);
        return allWooCategoriesCache || []; // Return old cache on failure if exists
    }
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

  // console.log(`[Rules] Applying for: Text='${searchableText.substring(0,100)}...', Initial Category='${categoryToAssignSlug}'`);
  rules.forEach(rule => {
    const ruleKeywordLower = rule.keyword.toLowerCase();
    if (rule.keyword && searchableText.includes(ruleKeywordLower)) {
      // console.log(`[Rules] Match for rule "${rule.name}" (keyword: "${rule.keyword}")`);
      if (rule.categoryToAssign && rule.categoryToAssign !== "sin_categoria") {
        categoryToAssignSlug = rule.categoryToAssign;
        // console.log(`[Rules] Assigning category from rule: ${categoryToAssignSlug}`);
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
  // console.log(`[Rules] Final assigned category: ${categoryToAssignSlug}, Tags: ${finalTags.join(', ')}`);
  return { assignedCategorySlug: categoryToAssignSlug, assignedTags: finalTags };
}

async function logSeoHistory(entry: Omit<SeoHistoryEntry, 'id' | 'processedAt'>) {
  if (!adminDb) {
    // console.error("[SEO History] Firestore (adminDb) not initialized. Skipping log.");
    return;
  }
  try {
    await adminDb.collection(SEO_HISTORY_COLLECTION).add({
      ...entry,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    // console.log(`[SEO History] Logged entry for ${entry.originalImageName}`);
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
        // console.log(`[Cleanup] Deleted temporary file: ${absolutePath}`);
      }
    } catch (error) {
      // console.warn(`[Cleanup] Error deleting temporary file ${filePath}:`, error);
    }
  }
}


async function createBatchCompletionNotification(batchId: string, userId: string, productResults: Array<{name: string, success: boolean, id?: number | string, error?: string }>) {
  if (!adminDb) {
      // console.warn("[API /process-photos] createBatchCompletionNotification: adminDb not available. Skipping notification.");
      return;
  }
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
  // console.log(`[Notification] Batch ${batchId}: ${title} - ${description}`);
  await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({
    userId, title, description, type,
    timestamp: admin.firestore.FieldValue.serverTimestamp() as any,
    isRead: false, linkTo: `/batch?batchId=${batchId}`
  } as Omit<AppNotification, 'id'>);
}

async function triggerNextPhotoProcessing(batchId: string, requestUrl: string, userId?: string, context?: string) {
  const apiUrl = new URL('/api/process-photos', requestUrl).toString();
  console.log(`[API Trigger - ${context || 'General'}] Triggering next processing for batch ${batchId} by calling: ${apiUrl}. UserId: ${userId || 'N/A'}`);
  try {
    // Fire and forget, but handle immediate errors from fetch() itself
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId, userId }),
    }).catch(fetchError => console.error(`[API Trigger - ${context || 'General'}] Error during self-trigger fetch for batch ${batchId}:`, fetchError));
  } catch (error) {
      console.error(`[API Trigger - ${context || 'General'}] Synchronous error setting up self-trigger for batch ${batchId}:`, error);
  }
}

async function updateSpecificFirestoreEntries(
  entryIds: string[],
  status: ProcessingStatusEntry['status'],
  updateData: Partial<ProcessingStatusEntry> = {}
) {
  if (!adminDb || entryIds.length === 0) {
    // console.warn("[API /process-photos] updateSpecificFirestoreEntries: adminDb not available or no entry IDs. Skipping update.");
    return;
  }
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
    // console.log(`[Firestore Update] Updated status for ${entryIds.length} entries to ${status}. First ID: ${entryIds[0]}, Keys updated: ${Object.keys(updateData).length > 0 ? Object.keys(updateData).join(', ') : 'none'}`);
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
    console.log(`\n--- [WooCommerce CreateProduct Group - ${productNameFromContext}] START ---`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Total image entries for this product group: ${productEntries.length}`);
    const productCreationStartTime = Date.now();

    const primaryEntry = productEntries.find(e => e.productContext?.isPrimary) || productEntries[0];
    if (!primaryEntry || !primaryEntry.productContext) {
        const criticalErrorMsg = "Datos de contexto del producto primario no encontrados para el grupo.";
        console.error(`[WooCommerce CreateProduct - ${productNameFromContext}] CRITICAL ERROR: ${criticalErrorMsg}`);
        await updateSpecificFirestoreEntries(productEntries.map(e => e.id), 'error_woocommerce_integration', { errorMessage: criticalErrorMsg});
        return { name: productNameFromContext, success: false, error: criticalErrorMsg };
    }
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Primary entry ID: ${primaryEntry.id}, Image name: ${primaryEntry.imageName}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Primary entry productContext: Name: ${primaryEntry.productContext.name}, SKU: ${primaryEntry.productContext.sku}, Type: ${primaryEntry.productContext.productType}`);

    let currentProductContext = { ...primaryEntry.productContext };
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Using product context from primary entry. Effective Product Name: ${currentProductContext.name}, SKU: ${currentProductContext.sku}`);

    let generatedContent = primaryEntry.generatedContent;
    if (!generatedContent) {
      // console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] Generated content was MISSING from primary entry (ID: ${primaryEntry.id}). Generating placeholder content now.`);
      const miniLMInput: MiniLMInput = {
        productName: currentProductContext.name,
        visualTags: primaryEntry.visualTags || [],
        category: (await fetchWooCommerceCategories()).find(c => c.slug === (primaryEntry.assignedCategorySlug || currentProductContext.category))?.name,
        existingKeywords: currentProductContext.keywords,
        existingAttributes: currentProductContext.attributes,
      };
      generatedContent = await generateContentWithMiniLM(miniLMInput); // Using TEMPORARILY DISABLED placeholder
      // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Placeholder content generated for product group. SEO Base='${generatedContent.seoFilenameBase}'`);
    } else {
      // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Using existing generatedContent from primary entry. SEO Base='${generatedContent.seoFilenameBase}'`);
    }


    if (!currentProductContext.sku || currentProductContext.sku.trim() === "") {
        currentProductContext.sku = `${cleanTextForFilename(currentProductContext.name).substring(0, 20)}-${Date.now().toString().slice(-4)}`;
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] SKU was missing or empty, generated: ${currentProductContext.sku}`);
    } else {
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Using provided SKU: ${currentProductContext.sku}`);
    }

    let finalShortDescription = currentProductContext.shortDescription || generatedContent?.shortDescription;
    let finalLongDescription = currentProductContext.longDescription || generatedContent?.longDescription;
    const productCategories = await fetchWooCommerceCategories();

    const templateDataForDesc = {
        nombre_producto: currentProductContext.name,
        categoria: productCategories.find(c => c.slug === (primaryEntry.assignedCategorySlug || currentProductContext.category))?.name || '',
        sku: currentProductContext.sku,
        palabras_clave: currentProductContext.keywords || (generatedContent?.tags || []).join(', '),
        atributos: (generatedContent?.attributes || currentProductContext.attributes)?.map(a => `${a.name}: ${a.value}`).join(', ') || '',
        precio_regular: currentProductContext.regularPrice || '0',
        precio_oferta: currentProductContext.salePrice || ''
    };

    if (!finalShortDescription || finalShortDescription.trim() === "" || finalShortDescription.includes("Placeholder MiniLM short description") || finalShortDescription.includes("Placeholder short description for")) {
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Short description missing or placeholder, attempting Genkit/Template fallback (Genkit TEMPORARILY DISABLED).`);
        try {
            // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Invoking (placeholder) generateProductDescription...`);
            const aiDescInput = { productName: currentProductContext.name, categoryName: templateDataForDesc.categoria, keywords: templateDataForDesc.palabras_clave, attributesSummary: templateDataForDesc.atributos };
            const aiOutput = await generateProductDescription(aiDescInput); // Using placeholder
            if (aiOutput.shortDescription) { finalShortDescription = aiOutput.shortDescription; /* console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Placeholder Genkit generated short desc.`); */ }
        } catch (aiError) { /* console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] Placeholder Genkit short desc generation failed:`, aiError); */ }
        if (!finalShortDescription || finalShortDescription.trim() === "" || finalShortDescription.includes("Placeholder MiniLM short description") || finalShortDescription.includes("Placeholder short description for")) {
            const shortDescTemplate = templates.find(t => t.type === 'descripcion_corta' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (primaryEntry.assignedCategorySlug || currentProductContext.category))));
            finalShortDescription = shortDescTemplate ? applyTemplate(shortDescTemplate.content, templateDataForDesc) : `Descubre ${currentProductContext.name}.`;
            // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Using template/fallback for short desc.`);
        }
    }

    if (!finalLongDescription || finalLongDescription.trim() === "" || finalLongDescription.includes("Placeholder MiniLM long description") || finalLongDescription.includes("Placeholder long description for")) {
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Long description missing or placeholder, attempting Genkit/Template fallback (Genkit TEMPORARILY DISABLED).`);
         try {
            // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Invoking (placeholder) generateProductDescription for long desc...`);
            const aiDescInput = { productName: currentProductContext.name, categoryName: templateDataForDesc.categoria, keywords: templateDataForDesc.palabras_clave, attributesSummary: templateDataForDesc.atributos };
            const aiOutput = await generateProductDescription(aiDescInput); // Using placeholder
            if (aiOutput.longDescription) { finalLongDescription = aiOutput.longDescription; /* console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Placeholder Genkit generated long desc.`); */ }
        } catch (aiError) { /* console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] Placeholder Genkit long desc generation failed:`, aiError); */ }
        if (!finalLongDescription || finalLongDescription.trim() === "" || finalLongDescription.includes("Placeholder MiniLM long description") || finalLongDescription.includes("Placeholder long description for")) {
            const longDescTemplate = templates.find(t => t.type === 'descripcion_larga' && (t.scope === 'global' || (t.scope === 'categoria_especifica' && t.categoryValue === (primaryEntry.assignedCategorySlug || currentProductContext.category))));
            finalLongDescription = longDescTemplate ? applyTemplate(longDescTemplate.content, templateDataForDesc) : `Descripción detallada de ${currentProductContext.name}.`;
            // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Using template/fallback for long desc.`);
        }
    }
    // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Final Descriptions: Short="${(finalShortDescription || '').substring(0,30)}...", Long="${(finalLongDescription || '').substring(0,30)}..."`);

    const wooImagesPayload: { id: number; alt?: string; name?: string, position?: number }[] = [];
    for (const entry of productEntries) {
        if (entry.wooCommerceMediaId) {
            const altText = entry.generatedContent?.seoMetadata?.alt || entry.seoMetadata?.alt || currentProductContext.name;
            const imageName = entry.seoName || entry.imageName;
            wooImagesPayload.push({ id: entry.wooCommerceMediaId, alt: altText, name: imageName, position: entry.productContext?.isPrimary ? 0 : (wooImagesPayload.length) });
             // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Added image to payload: Media ID ${entry.wooCommerceMediaId}, Alt: ${altText.substring(0,20)}...`);
        } else { console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] Entry ${entry.id} (Image: ${entry.imageName}) missing wooCommerceMediaId.`); }
    }
    wooImagesPayload.sort((a,b) => (a.position || 99) - (b.position || 99));
    wooImagesPayload.forEach((img, idx) => img.position = idx);
    // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Final WooCommerce Images Payload (Media IDs sorted): ${wooImagesPayload.map(i => `(id:${i.id},pos:${i.position})`).join(', ')}`);

    const wooCategoriesForProduct: { id: number }[] = [];
    const catSlugToUse = primaryEntry.assignedCategorySlug || currentProductContext.category;
    if (catSlugToUse) {
        const categoryInfo = productCategories.find(c => c.slug === catSlugToUse);
        if (categoryInfo) { wooCategoriesForProduct.push({ id: categoryInfo.id }); /* console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Assigning category: ID ${categoryInfo.id}`); */ }
        else { console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] Category slug "${catSlugToUse}" not found.`); }
    } else { /* console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] No category slug to use.`); */ }

    const tagsToUse = (generatedContent?.tags && generatedContent.tags.length > 0 ? generatedContent.tags : (primaryEntry.assignedTags || [])).map(tag => ({ name: tag }));
    // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Tags:`, tagsToUse.map(t => t.name).join(', '));

    const attributesToUse = (generatedContent?.attributes && generatedContent.attributes.length > 0 ? generatedContent.attributes : currentProductContext.attributes || [])
        .filter(attr => attr.name && attr.name.trim() !== "" && attr.value && attr.value.trim() !== "") // Ensure attributes are valid
        .map((attr, index) => ({ name: attr.name, options: attr.value.split('|').map(o => o.trim()), position: index, visible: true, variation: currentProductContext.productType === 'variable' }));
    // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Attributes (count: ${attributesToUse.length}): ${attributesToUse.map(a => `(n:${a.name},opts:${a.options.length},var:${a.variation})`).join('; ')}`);

    const wooProductData: any = {
        name: currentProductContext.name, type: currentProductContext.productType, sku: currentProductContext.sku,
        regular_price: String(currentProductContext.regularPrice || '0'), description: finalLongDescription, short_description: finalShortDescription,
        categories: wooCategoriesForProduct, tags: tagsToUse, images: wooImagesPayload, attributes: attributesToUse,
        meta_data: [ { key: '_wooautomate_batch_id', value: batchId }, { key: '_wooautomate_product_name_in_batch', value: productNameFromContext}, { key: '_seo_title', value: generatedContent?.seoMetadata?.title || currentProductContext.name }, { key: '_seo_description', value: generatedContent?.seoMetadata?.description || finalShortDescription?.substring(0,160) } ]
    };
    if (currentProductContext.salePrice && parseFloat(currentProductContext.salePrice) > 0) { wooProductData.sale_price = String(currentProductContext.salePrice); /* console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Sale price: ${currentProductContext.salePrice}`); */ }

    console.log(`\n[WooCommerce CreateProduct - ${productNameFromContext}] ---- PAYLOAD FOR WOOCOMMERCE API ('products' endpoint) ----`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Name: ${wooProductData.name}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Type: ${wooProductData.type}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] SKU: ${wooProductData.sku}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Regular Price: ${wooProductData.regular_price}`);
    if (wooProductData.sale_price) console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Sale Price: ${wooProductData.sale_price}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Short Description (first 50): ${(wooProductData.short_description || "").substring(0,50)}...`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Categories (IDs): ${wooProductData.categories.map((c:any) => c.id).join(', ')}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Tags (Names): ${wooProductData.tags.map((t:any) => t.name).join(', ')}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Images (Media IDs): ${wooProductData.images.map((img:any) => img.id).join(', ')}`);
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Attributes:`);
    wooProductData.attributes.forEach((attr: any, index: number) => {
      console.log(`  Attribute ${index + 1}: Name='${attr.name}', Options='${attr.options.join(' | ')}', Visible=${attr.visible}, Variation=${attr.variation}`);
    });
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Meta Data:`, JSON.stringify(wooProductData.meta_data, null, 2));
    console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] ---- END OF PAYLOAD ----\n`);


    let finalWooProductId: number | string | null = null;
    let finalErrorMessage: string | null = null;
    let finalSkuUsed: string | null = wooProductData.sku;

    const attemptProductCreation = async (productPayload: any, isRetry: boolean): Promise<{id: number | string | null, skuUsed: string | null, errorMsg?: string, errorDetails?: any}> => {
        let currentSkuAttempt = productPayload.sku;
        if (!wooApi) {
          const msg = `[WooCommerce CreateProduct - ${productNameFromContext}] CRITICAL: wooApi not initialized. Cannot POST product.`;
          console.error(msg);
          return {id: null, skuUsed: currentSkuAttempt, errorMsg: "WooCommerce API client not initialized."};
        }
        try {
            console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Attempting to POST product to WC. SKU: ${currentSkuAttempt}, Retry: ${isRetry}. Timeout: 120s`);
            const wcPostStartTime = Date.now();
            const response = await wooApi.post("products", productPayload, { timeout: 120000 }); // Increased timeout
            const wcPostEndTime = Date.now();
            console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] WooCommerce Product POSTED. SKU: ${currentSkuAttempt}, WC Product ID: ${response.data.id}. Time: ${wcPostEndTime - wcPostStartTime}ms`);
            return {id: response.data.id, skuUsed: currentSkuAttempt};
        } catch (error: any) {
            const wcPostEndTime = Date.now();
            const wooErrorData = error.response?.data;
            const wooErrorMessage = wooErrorData?.message || error.message || "Unknown WC API error during product creation";
            const wooErrorCode = wooErrorData?.code || "";
            console.error(`[WooCommerce CreateProduct - ${productNameFromContext}] Error (Attempt ${isRetry ? '2' : '1'}) creating product with SKU ${currentSkuAttempt}: ${wooErrorMessage} (Code: ${wooErrorCode}). Time: ${wcPostEndTime - productCreationStartTime}ms.`);
            console.error(`[WooCommerce CreateProduct - ${productNameFromContext}] Full WooCommerce error response data:`, JSON.stringify(wooErrorData, null, 2));

            const isSkuError = (wooErrorMessage.toLowerCase().includes("sku") && (wooErrorMessage.toLowerCase().includes("duplicate") || wooErrorMessage.toLowerCase().includes("ya existe") || wooErrorMessage.toLowerCase().includes("no válido") || wooErrorMessage.toLowerCase().includes("invalid"))) || wooErrorCode === 'product_invalid_sku' || (wooErrorData?.data?.params?.sku);
            if (isSkuError && !isRetry) {
                const newSku = `${cleanTextForFilename(productPayload.name || `fallback-sku`).substring(0,15)}-R${Date.now().toString().slice(-5)}`;
                console.warn(`[WooCommerce CreateProduct - ${productNameFromContext}] SKU ${currentSkuAttempt} was invalid/duplicate. Retrying with new SKU: ${newSku}`);
                const retryResult = await attemptProductCreation({ ...productPayload, sku: newSku }, true);
                if (retryResult.id && adminDb) {
                    const batchUpdateSku = adminDb.batch();
                    productEntries.forEach(entry => {
                        batchUpdateSku.update(adminDb.collection('processing_status').doc(entry.id), { 'productContext.sku': newSku, 'updatedAt': admin.firestore.FieldValue.serverTimestamp() });
                    });
                    await batchUpdateSku.commit().catch(e => console.error(`[WooCommerce CreateProduct - ${productNameFromContext}] Firestore SKU update to ${newSku} FAILED:`, e));
                    // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Firestore SKUs updated to ${newSku}.`);
                }
                return retryResult;
            }
            return {id: null, skuUsed: currentSkuAttempt, errorMsg: wooErrorMessage, errorDetails: wooErrorData};
        }
    };

    const creationResult = await attemptProductCreation(wooProductData, false);
    finalWooProductId = creationResult.id;
    finalSkuUsed = creationResult.skuUsed;
    finalErrorMessage = creationResult.errorMsg || null;
    const finalErrorDetails = creationResult.errorDetails;

    const entryIdsForThisProduct = productEntries.map(e => e.id);
    if (finalWooProductId) {
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] Product creation SUCCESS. WC Product ID: ${finalWooProductId}, SKU used: ${finalSkuUsed}`);
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'completed_woocommerce_integration', { productAssociationId: String(finalWooProductId), progress: 100, lastMessage: `Producto creado con ID: ${finalWooProductId}. SKU: ${finalSkuUsed}` });
        await logSeoHistory({ batchId, originalImageName: primaryEntry.imageName, productName: currentProductContext.name, productId: finalWooProductId, seoName: generatedContent?.seoFilenameBase, shortDescription: finalShortDescription, longDescription: finalLongDescription, seoMetadata: generatedContent?.seoMetadata, tags: generatedContent?.tags, attributes: generatedContent?.attributes, category: primaryEntry.assignedCategorySlug || currentProductContext.category });
        const productCreationEndTime = Date.now();
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] END - Success. Total time: ${productCreationEndTime - productCreationStartTime}ms`);
        console.log(`--- [WooCommerce CreateProduct Group - ${productNameFromContext}] END ---`);
        return { name: productNameFromContext, success: true, id: finalWooProductId };
    } else {
        const detailedError = finalErrorDetails ? JSON.stringify(finalErrorDetails) : (finalErrorMessage || "Error desconocido en WC");
        console.error(`[WooCommerce CreateProduct - ${productNameFromContext}] Product creation FAILED. SKU Attempted: ${finalSkuUsed}. Error: ${finalErrorMessage}. Details: ${detailedError}`);
        await updateSpecificFirestoreEntries(entryIdsForThisProduct, 'error_woocommerce_integration', { errorMessage: `Error WooCommerce: ${detailedError.substring(0,250)}`, progress: 100 });
        if (adminDb && userId) {
            await adminDb.collection(APP_NOTIFICATIONS_COLLECTION).add({ userId, title: `Error al crear producto "${productNameFromContext}"`, description: `SKU: ${finalSkuUsed || 'N/A'}. Error: ${detailedError.substring(0, 150)}`, type: 'error', timestamp: admin.firestore.FieldValue.serverTimestamp() as any, isRead: false, linkTo: `/batch?batchId=${batchId}` } as Omit<AppNotification, 'id'>);
        }
        const productCreationEndTime = Date.now();
        // console.log(`[WooCommerce CreateProduct - ${productNameFromContext}] END - Failure. Total time: ${productCreationEndTime - productCreationStartTime}ms`);
        console.log(`--- [WooCommerce CreateProduct Group - ${productNameFromContext}] END ---`);
        return { name: productNameFromContext, success: false, error: detailedError };
    }
}


export async function POST(request: NextRequest) {
  let body: { batchId?: string; userId?: string } = {};
  let currentPhotoDocIdForErrorHandling: string | null = null; 

  try {
    const requestStartTime = Date.now();
    // console.log(`\n\n[API /process-photos] START - POST request received at ${new Date(requestStartTime).toISOString()}`);
    
    try {
        body = await request.clone().json();
        // console.log(`[API /process-photos] Request body parsed: batchId='${body.batchId}', userId='${body.userId}'`);
    } catch (jsonError: any) {
        console.error("[API /process-photos] ERROR: Failed to parse request body as JSON.", jsonError.message);
        const rawBody = await request.text().catch(() => "Could not read raw body.");
        console.error("[API /process-photos] Raw request body (first 200 chars):", rawBody.substring(0,200));
        return NextResponse.json({ error: 'Invalid request body: Must be JSON.', details: jsonError.message }, { status: 400 });
    }

    if (!adminDb || !adminAuth) {
      console.error("[API /process-photos] CRITICAL: Firebase Admin SDK (adminDb or adminAuth) not initialized. Aborting.");
      return NextResponse.json({ error: 'Server configuration error: Firebase Admin not available.' }, { status: 500 });
    }
     if (!wooApi) {
      console.error("[API /process-photos] CRITICAL: WooCommerce API client (wooApi) not initialized. Aborting.");
      return NextResponse.json({ error: 'Server configuration error: WooCommerce API not available.' }, { status: 500 });
    }
    // console.log(`[API /process-photos] Batch ${body.batchId}: Firebase Admin SDK and WooCommerce API client seem initialized.`);


    const { batchId } = body;
    const userIdFromRequest = body.userId;

    if (!batchId) {
      console.error("[API /process-photos] ERROR: batchId is required. Aborting.");
      return NextResponse.json({ error: 'batchId is required' }, { status: 400 });
    }
    // console.log(`[API /process-photos] Batch ${batchId}: Processing initiated.`);

    // console.log(`[API /process-photos] Batch ${batchId}: Attempting to load shared resources (categories, templates, rules)...`);
    const fetchCategoriesPromise = fetchWooCommerceCategories(); 
    const getTemplatesPromise = getTemplates();
    const getAutomationRulesPromise = getAutomationRules();
    const [productCategories, allTemplates, allAutomationRules] = await Promise.all([fetchCategoriesPromise, getTemplatesPromise, getAutomationRulesPromise]);
    // console.log(`[API /process-photos] Batch ${batchId}: Shared resources loaded. Categories: ${productCategories?.length || 0}, Templates: ${allTemplates.length}, Rules: ${allAutomationRules.length}`);


    // ---- Stage 1: Process individual 'uploaded' photos ----
    // console.log(`[API /process-photos] Batch ${batchId}: Querying for photos with status 'uploaded'.`);
    const photosToProcessSnapshot = await adminDb.collection('processing_status')
                                          .where('batchId', '==', batchId)
                                          .where('status', '==', 'uploaded')
                                          .orderBy(admin.firestore.FieldPath.documentId())
                                          .limit(1)
                                          .get();

    // console.log(`[API /process-photos] Batch ${batchId}: Found ${photosToProcessSnapshot.size} photo(s) with status 'uploaded'.`);

    if (!photosToProcessSnapshot.empty) {
      const photoDoc = photosToProcessSnapshot.docs[0];
      currentPhotoDocIdForErrorHandling = photoDoc.id;
      const photoData = { id: photoDoc.id, ...photoDoc.data() } as ProcessingStatusEntry;
      const photoDocRef = adminDb.collection('processing_status').doc(photoData.id);
      const userIdForThisPhoto = userIdFromRequest || photoData.userId;

      // console.log(`[ImgProc - ${photoData.imageName}] START individual processing. Doc ID: ${photoData.id}, Batch: ${batchId}. Product Context Name: ${photoData.productContext?.name || 'N/A'}`);
      const imgProcStartTime = Date.now();

      try {
        await photoDocRef.update({ status: 'processing_image_started', progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        if (!photoData.originalDownloadUrl) {
            console.error(`[ImgProc - ${photoData.imageName}] ERROR: originalDownloadUrl is missing. Cannot process.`);
            await photoDocRef.update({ status: 'error_processing_image', errorMessage: 'Missing originalDownloadUrl.', progress: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            await triggerNextPhotoProcessing(batchId, request.url, userIdForThisPhoto, `After critical URL error for ${photoData.imageName}`);
            return NextResponse.json({ message: `Error processing ${photoData.imageName}: missing URL. Triggered next.`, batchId: batchId, errorPhotoId: photoData.id });
        }

        const localImageAbsolutePath = path.join(process.cwd(), 'public', photoData.originalDownloadUrl.startsWith('/') ? photoData.originalDownloadUrl.substring(1) : photoData.originalDownloadUrl);
        let imageBuffer: Buffer;
        try {
          // console.log(`[ImgProc - ${photoData.imageName}] Reading local file: ${localImageAbsolutePath}`);
          imageBuffer = await fs.readFile(localImageAbsolutePath);
          // console.log(`[ImgProc - ${photoData.imageName}] Local file read successfully. Size: ${imageBuffer.length}`);
        } catch (readError: any) {
           console.error(`[ImgProc - ${photoData.imageName}] Error reading local file ${localImageAbsolutePath}:`, readError.message);
           await photoDocRef.update({ status: 'error_processing_image', errorMessage: `Failed to read local image file: ${readError.message.substring(0,200)}`, progress: 5, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
           throw readError; // Re-throw to be caught by outer catch
        }
        // console.log(`[ImgProc - ${photoData.imageName}] Image buffer loaded. Size: ${imageBuffer.length} bytes.`);
        await photoDocRef.update({ status: 'processing_image_downloaded', progress: 10, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

        const parsedNameData = photoData.productContext?.name ?
          extractProductNameAndAttributesFromFilename(photoData.imageName, photoData.productContext.name) :
          extractProductNameAndAttributesFromFilename(photoData.imageName);
        await photoDocRef.update({ status: 'processing_image_name_parsed', progress: 15, parsedNameData, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        // console.log(`[ImgProc - ${photoData.imageName}] Name parsed. Prod='${parsedNameData.extractedProductName}', Attrs='${parsedNameData.potentialAttributes.join(',')}'`);

        // --- Start AI: Image Classification (stubbed) ---
        // console.log(`[ImgProc - ${photoData.imageName}] AI: classifyImage START (stubbed)`);
        const classifyStartTime = Date.now();
        const visualTags = (await classifyImage(imageBuffer).catch(e => {
            // console.warn(`[ImgProc - ${photoData.imageName}] AI: MobileNet classification (stubbed) failed/returned empty:`, e); return [];
        })).slice(0, 5).map(item => item.className.split(',')[0].trim());
        const classifyEndTime = Date.now();
        // console.log(`[ImgProc - ${photoData.imageName}] AI: classifyImage END (stubbed). Time: ${classifyEndTime - classifyStartTime}ms. Tags: ${visualTags.join(', ')}`);
        await photoDocRef.update({ status: 'processing_image_classified', progress: 25, visualTags, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        // --- End AI: Image Classification ---

        // --- Start AI: Content Generation (stubbed) ---
        const productCategoriesForMiniLM = await fetchWooCommerceCategories(); // Ensure categories are fresh for this step
        const miniLMInput: MiniLMInput = {
          productName: parsedNameData?.extractedProductName || photoData.productContext?.name || photoData.imageName.split('.')[0],
          visualTags,
          category: productCategoriesForMiniLM?.find(c => c.slug === (photoData.assignedCategorySlug || photoData.productContext?.category))?.name || photoData.productContext?.category,
          existingKeywords: photoData.productContext?.keywords,
          existingAttributes: photoData.productContext?.attributes,
        };
        // console.log(`[ImgProc - ${photoData.imageName}] AI: generateContentWithMiniLM START (TEMPORARILY DISABLED). ProductName: ${miniLMInput.productName}, Category: ${miniLMInput.category}`);
        const miniLMStartTime = Date.now();
        const generatedContent = await generateContentWithMiniLM(miniLMInput); // Using placeholder function
        const miniLMEndTime = Date.now();
        // console.log(`[ImgProc - ${photoData.imageName}] AI: generateContentWithMiniLM END (TEMPORARILY DISABLED). Time: ${miniLMEndTime - miniLMStartTime}ms. SEO Base='${generatedContent.seoFilenameBase}'`);
        await photoDocRef.update({ status: 'processing_image_content_generated', progress: 45, generatedContent, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        // --- End AI: Content Generation ---
        

        const processedImageDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
        await fs.mkdir(processedImageDir, { recursive: true });
        const seoFilenameWithExt = `${generatedContent.seoFilenameBase || cleanTextForFilename(miniLMInput.productName)}.webp`;
        const processedImageAbsolutePath = path.join(processedImageDir, seoFilenameWithExt);
        const processedImageRelativePath = path.join('/', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId, seoFilenameWithExt).replace(/\\\\/g, '/');

        // console.log(`[ImgProc - ${photoData.imageName}] Sharp image optimization START: To ${processedImageAbsolutePath}`);
        const sharpStartTime = Date.now();
        await sharp(imageBuffer).webp({ quality: 80 }).resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).toFile(processedImageAbsolutePath);
        const sharpEndTime = Date.now();
        // console.log(`[ImgProc - ${photoData.imageName}] Sharp image optimization END. Time: ${sharpEndTime - sharpStartTime}ms`);
        
        const updateDataForOptimized: Partial<ProcessingStatusEntry> = {
          status: 'processing_image_optimized', progress: 65, seoName: seoFilenameWithExt,
          processedImageStoragePath: processedImageRelativePath, processedImageDownloadUrl: processedImageRelativePath,
          seoMetadata: generatedContent.seoMetadata, updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        };
        await photoDocRef.update(updateDataForOptimized);
        
        const ruleApplicationResult = applyAutomationRules(parsedNameData, visualTags, photoData.productContext, allAutomationRules);
        const finalTags = Array.from(new Set([...(generatedContent.tags || []), ...ruleApplicationResult.assignedTags]));
        const finalCategorySlug = ruleApplicationResult.assignedCategorySlug || photoData.productContext?.category;

        const updateDataForRuleApp: Partial<ProcessingStatusEntry> = {
          status: 'processing_image_rules_applied', progress: 75, assignedCategorySlug: finalCategorySlug,
          assignedTags: finalTags, updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
        };
        if (generatedContent.attributes && generatedContent.attributes.length > 0) {
          const currentProductContext = photoData.productContext || {} as WizardProductContext; 
          updateDataForRuleApp.productContext = { ...currentProductContext, attributes: generatedContent.attributes } as WizardProductContext;
        }
        await photoDocRef.update(updateDataForRuleApp);
        // console.log(`[ImgProc - ${photoData.imageName}] Rules applied. Cat: ${finalCategorySlug}, Tags: ${finalTags.join(', ')}`);

        // console.log(`[ImgProc - ${photoData.imageName}] uploadImageToWooCommerceMedia START for ${processedImageAbsolutePath}`);
        const wcUploadStartTime = Date.now();
        const wcMediaUploadResult = await uploadImageToWooCommerceMedia(processedImageAbsolutePath, seoFilenameWithExt, miniLMInput.productName);
        const wcUploadEndTime = Date.now();
        // console.log(`[ImgProc - ${photoData.imageName}] uploadImageToWooCommerceMedia END. Time: ${wcUploadEndTime - wcUploadStartTime}ms.`);
        
        if (wcMediaUploadResult && 'id' in wcMediaUploadResult && wcMediaUploadResult.id) {
          // console.log(`[ImgProc - ${photoData.imageName}] WC Media Upload SUCCESS. Media ID: ${wcMediaUploadResult.id}`);
          const updateDataForWCMedia: Partial<ProcessingStatusEntry> = {
              status: 'completed_image_pending_woocommerce', progress: 100, wooCommerceMediaId: wcMediaUploadResult.id,
              updatedAt: admin.firestore.FieldValue.serverTimestamp() as any,
              lastMessage: `Image uploaded to WC Media (ID: ${wcMediaUploadResult.id}).`
          };
          const currentSeoMetadata = photoData.generatedContent?.seoMetadata || photoData.seoMetadata || {};
          if(wcMediaUploadResult.alt_text) updateDataForWCMedia.seoMetadata = { ...currentSeoMetadata, alt: wcMediaUploadResult.alt_text };
          else if (!currentSeoMetadata.alt && miniLMInput.productName) updateDataForWCMedia.seoMetadata = { ...currentSeoMetadata, alt: `Image of ${miniLMInput.productName}` };
          await photoDocRef.update(updateDataForWCMedia);
        } else {
          const uploadErrorMsg = wcMediaUploadResult?.error || `Unknown error uploading ${seoFilenameWithExt} to WC Media.`;
          console.error(`[ImgProc - ${photoData.imageName}] FAILED to upload to WC Media. Error: ${uploadErrorMsg}`, "Details:", wcMediaUploadResult?.details);
          await photoDocRef.update({ status: 'error_processing_image', errorMessage: uploadErrorMsg.substring(0,250), progress: 85, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
          throw new Error(uploadErrorMsg); // This will be caught by the outer try/catch for the image
        }
        const imgProcEndTime = Date.now();
        // console.log(`[ImgProc - ${photoData.imageName}] END individual image processing. Status: completed_image_pending_woocommerce. Total time: ${imgProcEndTime - imgProcStartTime}ms`);
      } catch (photoProcessingError: any) {
        const imgProcEndTime = Date.now();
        console.error(`[ImgProc - ${photoData.imageName}] ERROR during individual photo processing steps after ${imgProcEndTime - imgProcStartTime}ms. Doc ID: ${photoData.id}. Error: ${photoProcessingError.message}`);
        const currentStatusSnapshot = await photoDocRef.get(); 
        const currentStatus = currentStatusSnapshot.data()?.status;
        if (currentStatus !== 'error_processing_image' && currentStatus !== 'error_woocommerce_integration') { 
            await photoDocRef.update({
                status: 'error_processing_image',
                errorMessage: `PhotoProc Error: ${photoProcessingError.message?.substring(0, 250) || 'Unknown error during image processing.'}`,
                progress: photoData.progress || 0, 
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
      } finally {
        // console.log(`[ImgProc - ${photoData.imageName}] FINALLY block: Triggering next processing for batch ${batchId}.`);
        await triggerNextPhotoProcessing(batchId, request.url, userIdForThisPhoto, `After processing ${photoData.imageName}`);
      }
      const requestEndTime = Date.now();
      // console.log(`[API /process-photos] END - Processed single image ${photoData.imageName}. Total request time: ${requestEndTime - requestStartTime}ms.`);
      return NextResponse.json({ message: `Processed ${photoData.imageName}. Triggered next.`, batchId: batchId, processedPhotoId: photoData.id });

    } else {
      // ---- Stage 2: No 'uploaded' photos left, try to create WooCommerce products ----
      // console.log(`[API /process-photos] Batch ${batchId}: NO 'uploaded' photos found. Checking for 'completed_image_pending_woocommerce'...`);

      const entriesReadyForWooCommerceSnapshot = await adminDb.collection('processing_status')
                                                      .where('batchId', '==', batchId)
                                                      .where('status', '==', 'completed_image_pending_woocommerce')
                                                      .get();

      const entriesReadyForWooCommerce = entriesReadyForWooCommerceSnapshot.docs
                                            .map(doc => ({id: doc.id, ...doc.data() } as ProcessingStatusEntry))
                                            .filter(entry => entry.productContext && entry.productContext.name); 


      const userIdForBatchOverall = userIdFromRequest || entriesReadyForWooCommerce[0]?.userId || 'batch_processing_user';

      // console.log(`[API /process-photos] Batch ${batchId}: Found ${entriesReadyForWooCommerce.length} entries for WC product creation.`);

      if (entriesReadyForWooCommerce.length > 0) {
        const productsMap: Record<string, ProcessingStatusEntry[]> = {};
        entriesReadyForWooCommerce.forEach(entry => {
            const productNameKey = entry.productContext?.name; 
            if (!productNameKey) { 
                console.warn(`[API /process-photos] Batch ${batchId}: Entry ${entry.id} (Image: ${entry.imageName}) missing productContext.name. Marking error.`);
                updateSpecificFirestoreEntries([entry.id], 'error_woocommerce_integration', { errorMessage: "Contexto de nombre de producto faltante."});
                return;
            }
            if (!productsMap[productNameKey]) productsMap[productNameKey] = [];
            productsMap[productNameKey].push(entry);
        });

        const numProductsToCreate = Object.keys(productsMap).length;
        // console.log(`[API /process-photos] Batch ${batchId}: Grouped into ${numProductsToCreate} distinct products for WC creation.`);
        const productCreationResults: Array<{name: string, success: boolean, id?: number | string, error?: string }> = [];

        if (numProductsToCreate > 0) {
          for (const productNameKey in productsMap) {
            const productEntries = productsMap[productNameKey];
            // console.log(`[API /process-photos] Batch ${batchId}: createWooCommerceProductForGroup START for product group "${productNameKey}" (${productEntries.length} images).`);
            const result = await createWooCommerceProductForGroup(productNameKey, productEntries, batchId, userIdForBatchOverall, allTemplates, allAutomationRules);
            // console.log(`[API /process-photos] Batch ${batchId}: createWooCommerceProductForGroup END for product group "${productNameKey}". Success: ${result.success}`);
            productCreationResults.push(result);
            if (result.success) {
                const pathsToDelete = productEntries.flatMap(e => [e.originalDownloadUrl, e.processedImageStoragePath]).filter(p => !!p) as string[];
                await cleanupTempFiles(pathsToDelete);
                // console.log(`[Cleanup] Batch ${batchId}: Cleaned images for product "${productNameKey}".`);
            }
          }

          // console.log(`[API /process-photos] Batch ${batchId}: Finished all product creations. Results count: ${productCreationResults.length}`);
          await createBatchCompletionNotification(batchId, userIdForBatchOverall, productCreationResults);

          const allBatchEntriesFinalSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
          const allBatchEntriesFinal = allBatchEntriesFinalSnapshot.docs.map(d => d.data() as ProcessingStatusEntry);
          const isEntireBatchTerminal = allBatchEntriesFinal.every(e => e.status.startsWith('completed_') || e.status.startsWith('error_'));

          if(isEntireBatchTerminal) {
              // console.log(`[API /process-photos] Batch ${batchId}: All products processed. Batch is TERMINAL. Final cleanup.`);
              const rawBatchDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_RAW_DIR_RELATIVE, batchId);
              const processedBatchDir = path.join(process.cwd(), 'public', LOCAL_UPLOAD_PROCESSED_DIR_RELATIVE, batchId);
              try { await fs.rm(rawBatchDir, { recursive: true, force: true }); /* console.log(`[Cleanup] Deleted raw batch dir: ${rawBatchDir}`); */ } catch (e: any) { /* console.warn(`[Cleanup] Could not delete raw dir ${rawBatchDir}: ${e.message}`) */ }
              try { await fs.rm(processedBatchDir, { recursive: true, force: true }); /* console.log(`[Cleanup] Deleted processed batch dir: ${processedBatchDir}`); */ } catch (e: any) { /* console.warn(`[Cleanup] Could not delete processed dir ${processedBatchDir}: ${e.message}`) */ }
              const requestEndTime = Date.now();
              // console.log(`[API /process-photos] END - Batch ${batchId} WC product creation complete & batch terminal. Total request time: ${requestEndTime - requestStartTime}ms.`);
              return NextResponse.json({ message: `Batch ${batchId} WC product creation complete & batch terminal.`, results: productCreationResults });
          } else {
              const requestEndTime = Date.now();
              // console.log(`[API /process-photos] END - Batch ${batchId} WC product creation cycle done, but batch NOT fully terminal. Total request time: ${requestEndTime - requestStartTime}ms.`);
              return NextResponse.json({ message: `Batch ${batchId} WC product creation cycle done. Batch not terminal.`, results: productCreationResults });
          }
        } else {
            //  console.log(`[API /process-photos] Batch ${batchId}: No valid product groups after filtering for WC creation.`);
             const requestEndTime = Date.now();
            //  console.log(`[API /process-photos] END - Batch ${batchId}: No valid product groups for WC. Total request time: ${requestEndTime - requestStartTime}ms.`);
             return NextResponse.json({ message: `Batch ${batchId}: No valid product groups. No products created.`, status: 'batch_completed_no_valid_groups' });
        }
      } else {
        // No 'uploaded' and no 'completed_image_pending_woocommerce'
        const allBatchEntriesSnapshot = await adminDb.collection('processing_status').where('batchId', '==', batchId).get();
        if (allBatchEntriesSnapshot.empty) {
            //  console.log(`[API /process-photos] Batch ${batchId}: Is empty or fully processed/removed.`);
             const requestEndTime = Date.now();
            //  console.log(`[API /process-photos] END - Batch ${batchId}: Empty or fully processed. Total request time: ${requestEndTime - requestStartTime}ms.`);
             return NextResponse.json({ message: `Batch ${batchId} is empty or fully processed. No action.` });
        }
        const allTerminal = allBatchEntriesSnapshot.docs.every(doc => {
            const status = doc.data().status;
            return status.startsWith('completed_') || status.startsWith('error_');
        });

        if (allTerminal) {
            // console.log(`[API /process-photos] Batch ${batchId}: FINAL CHECK - All entries terminal. Processing complete.`);
            const requestEndTime = Date.now();
            // console.log(`[API /process-photos] END - Batch ${batchId}: Fully terminal. Total request time: ${requestEndTime - requestStartTime}ms.`);
             return NextResponse.json({ message: `Batch ${batchId} processing fully terminal.`, status: 'batch_already_terminal' });
        }
        // console.log(`[API /process-photos] Batch ${batchId}: No 'uploaded' or 'completed_image_pending_woocommerce' entries, AND not all entries are terminal. Batch stalled or waiting.`);
        const requestEndTime = Date.now();
        // console.log(`[API /process-photos] END - Batch ${batchId}: Stalled or waiting. Total request time: ${requestEndTime - requestStartTime}ms.`);
        return NextResponse.json({ message: `Batch ${batchId} has no actionable entries, but not fully terminal. Waiting.`, status: 'batch_stalled_or_waiting' });
      }
    }
  } catch (error: any) {
    const errorTime = Date.now();
    console.error(`[API /process-photos] CRITICAL TOP-LEVEL ERROR at ${new Date(errorTime).toISOString()}. Batch: ${body?.batchId || 'unknown'}, PhotoDoc ID (if set): ${currentPhotoDocIdForErrorHandling || 'N/A'}.`);
    console.error("Error message:", error.message || "Unknown error");
    console.error("Error stack:", error.stack || "No stack available");
    
    const errorMessageString = String(error.message || 'Unknown server error during batch processing.');
    
    if (adminDb && currentPhotoDocIdForErrorHandling) {
        try {
            const photoDocRef = adminDb.collection('processing_status').doc(currentPhotoDocIdForErrorHandling);
            // console.log(`[API /process-photos] Attempting to mark doc ${currentPhotoDocIdForErrorHandling} with error status due to top-level catch.`);
            const currentEntrySnapshot = await photoDocRef.get();
            if (currentEntrySnapshot.exists()) {
                const currentEntryData = currentEntrySnapshot.data() as ProcessingStatusEntry;
                if (!currentEntryData.status.startsWith('error_') && !currentEntryData.status.startsWith('completed_')) {
                     photoDocRef.update({ status: 'error_processing_image', errorMessage: `API General Error: ${errorMessageString.substring(0, 200)}`, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
                               .catch(dbError => console.error("[API /process-photos] Firestore update FAILED during CRITICAL ERROR handling:", dbError));
                } else {
                    // console.log(`[API /process-photos] Doc ${currentPhotoDocIdForErrorHandling} already in a terminal state (${currentEntryData.status}). Not updating with general error.`);
                }
            }
        } catch (dbUpdateError) { 
            console.error("[API /process-photos] Synchronous error during Firestore update attempt in CRITICAL ERROR handling:", dbUpdateError);
        }
    } else if (body?.batchId) {
        console.error(`[API /process-photos] General error for batch ${body.batchId}. Details: ${errorMessageString}. No specific photo document ID was set for error handling.`);
    }

    return NextResponse.json(
        { 
            error: 'Failed to process photos due to a critical server error.', 
            details: errorMessageString.substring(0,500),
            batchId: body?.batchId || 'unknown',
            photoIdOnError: currentPhotoDocIdForErrorHandling || 'N/A'
        }, 
        { status: 500 }
    );
  }
}
    
