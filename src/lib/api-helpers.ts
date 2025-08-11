// src/lib/api-helpers.ts
import type * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { createWooCommerceApi } from '@/lib/woocommerce';
import { createWordPressApi } from '@/lib/wordpress';
import { createShopifyApi } from '@/lib/shopify';
import type WooCommerceRestApiType from '@woocommerce/woocommerce-rest-api';
import type { AxiosInstance } from 'axios';
import axios from 'axios';
import FormData from 'form-data';
import type { ExtractedWidget } from './types';
import { z } from 'zod';
import crypto from 'crypto';
import sharp from 'sharp';
import { Readable } from 'stream';
import { PROMPT_DEFAULTS } from './constants';


export const partnerAppConnectionDataSchema = z.object({
  partnerApiToken: z.string().optional(),
  organizationId: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  automationApiKey: z.string().optional(), // Added field for system key
});
export type PartnerAppConnectionData = z.infer<typeof partnerAppConnectionDataSchema>;

interface ApiClients {
  wooApi: WooCommerceRestApiType | null;
  wpApi: AxiosInstance | null;
  shopifyApi: AxiosInstance | null;
  activeConnectionKey: string | null;
  settings: admin.firestore.DocumentData | undefined;
  prompts: Record<string, string>; // NEW: Will hold the applicable prompts
}


/**
 * Retrieves Shopify Partner App credentials from Firestore. This function now reads
 * from the global configuration and returns all necessary credential fields.
 * @returns The credentials object including partner and custom app details.
 * @throws If credentials are not configured in the global settings.
 */
export async function getPartnerCredentials(): Promise<PartnerAppConnectionData> {
    if (!adminDb) {
        throw new Error("Firestore not configured on server");
    }

    const settingsRef = adminDb.collection('companies').doc('global_settings');
    const doc = await settingsRef.get();
    
    if (!doc.exists) {
        throw new Error("El documento de ajustes globales ('global_settings') no se encontró.");
    }
    
    const settingsData = doc.data() || {};
    const partnerAppData = partnerAppConnectionDataSchema.safeParse(settingsData.connections?.partner_app || {});

    if (!partnerAppData.success) {
        throw new Error("Los datos de la App de Partner en la configuración global no son válidos.");
    }
    
    return partnerAppData.data;
}


function extractWidgetsRecursive(elements: any[], widgets: ExtractedWidget[]): void {
    if (!elements || !Array.isArray(elements)) return;

    for (const element of elements) {
        if (element.elType === 'widget') {
             if (element.widgetType === 'heading' && element.settings?.title) {
                widgets.push({
                    id: element.id,
                    tag: element.settings.header_size || 'h2',
                    text: element.settings.title,
                    type: 'heading',
                });
            } else if (element.widgetType === 'text-editor' && element.settings?.editor) {
                 widgets.push({
                    id: element.id,
                    text: element.settings.editor,
                    type: 'text-editor',
                    tag: 'p',
                });
            }
        }
        
        if (element.elements && element.elements.length > 0) {
            extractWidgetsRecursive(element.elements, widgets);
        }
    }
}

export function extractElementorWidgets(elementorDataString: string): ExtractedWidget[] {
    try {
        const widgets: ExtractedWidget[] = [];
        if (!elementorDataString) return widgets;
        const elementorData = JSON.parse(elementorDataString);
        extractWidgetsRecursive(elementorData, widgets);
        return widgets;
    } catch (e) {
        console.error("Failed to parse or extract Elementor widgets", e);
        return [];
    }
}


/**
 * Recursively traverses Elementor's data structure to collect all user-visible text content.
 * @param data The 'elements' array or any nested object/array from Elementor's data.
 * @param texts The array to push found texts into.
 */
function collectElementorTextsRecursive(data: any, texts: string[]): void {
    if (!data) return;

    if (Array.isArray(data)) {
        data.forEach(item => collectElementorTextsRecursive(item, texts));
        return;
    }

    if (typeof data === 'object') {
        // Handle flip-box content
        if(data.widgetType === 'flip-box' && data.settings) {
            if(data.settings.title_text_a) texts.push(data.settings.title_text_a);
            if(data.settings.description_text_a) texts.push(data.settings.description_text_a);
            if(data.settings.title_text_b) texts.push(data.settings.title_text_b);
            if(data.settings.description_text_b) texts.push(data.settings.description_text_b);
            if(data.settings.button_text) texts.push(data.settings.button_text);
        }

        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description', 'title_text', 'description_text',
            'title_text_a', 'description_text_a', 'title_text_b', 'description_text_b'
        ];

        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    texts.push(value);
                } else if (typeof value === 'object' && value !== null) {
                    collectElementorTextsRecursive(value, texts);
                }
            }
        }
    }
}

export function collectElementorTexts(elements: any[]): string[] {
    const texts: string[] = [];
    collectElementorTextsRecursive(elements, texts);
    return texts;
}

/**
 * Recursively traverses a deep copy of Elementor's data structure and replaces text content
 * based on a map of widget IDs to their new text.
 * @param data A deep copy of the original 'elements' array or nested object/array.
 * @param widgetUpdates A map where keys are widget IDs and values are the new text content.
 * @returns The Elementor data structure with translated text.
 */
export function replaceElementorTexts(data: any, widgetUpdates: Map<string, string>): any {
    if (!data) return data;

    function traverse(elements: any[]): any[] {
        return elements.map(element => {
            if (!element || typeof element !== 'object') return element;

            const newElement = { ...element };

            // If this element is a widget we need to update, replace its text
            if (newElement.elType === 'widget' && widgetUpdates.has(newElement.id)) {
                const newText = widgetUpdates.get(newElement.id);
                if (newElement.widgetType === 'heading' && newElement.settings) {
                    newElement.settings = { ...newElement.settings, title: newText };
                } else if (newElement.widgetType === 'text-editor' && newElement.settings) {
                    newElement.settings = { ...newElement.settings, editor: newText };
                }
            }

            // Recurse into nested elements
            if (newElement.elements && Array.isArray(newElement.elements)) {
                newElement.elements = traverse(newElement.elements);
            }

            return newElement;
        });
    }

    return traverse(data);
}


export function findElementorImageContext(elements: any[], imageUrl: string): string {
    let context = '';
    if (!elements || !Array.isArray(elements)) return context;

    function traverse(items: any[]) {
        for (const item of items) {
            if (context) return;
            if (!item || typeof item !== 'object') continue;

            const settings = item.settings;
            if (settings) {
                // Handle image box widgets like 'the7_image_box_widget'
                if (item.widgetType?.includes('image_box') && settings.image?.url === imageUrl) {
                    context = settings.description_text?.replace(/<[^>]+>/g, ' ').trim() || settings.title_text || '';
                } 
                // Handle standard image widgets
                else if (item.widgetType === 'image' && settings.image?.url === imageUrl) {
                    context = settings.caption?.replace(/<[^>]+>/g, ' ').trim() || settings.title_text || '';
                }
                // Handle slider widgets
                else if (item.widgetType === 'slides' && settings.slides) {
                    const slide = settings.slides.find((s: any) => s.background_image?.url === imageUrl);
                    if (slide) {
                        context = slide.description?.replace(/<[^>]+>/g, ' ').trim() || slide.heading || '';
                    }
                }
                
                if (context) return;
            }
            
            // Recurse into nested elements
            if (item.elements && item.elements.length > 0) {
                traverse(item.elements);
            }
        }
    }

    traverse(elements);
    return context;
}

export function findBeaverBuilderImages(data: any[]): { url: string; }[] {
    const images: { url: string; }[] = [];
    if (!data || !Array.isArray(data)) return images;

    const shortcodeRegex = /\[image src="([^"]+)"/g;

    function traverse(items: any[]) {
        if (!items || !Array.isArray(items)) return;
        for (const item of items) {
            if (typeof item === 'object' && item !== null) {
                for (const key in item) {
                    if (Object.prototype.hasOwnProperty.call(item, key)) {
                        const value = item[key];
                        if (typeof value === 'string') {
                            // Direct URL checks
                            const imageKeys = ['image', 'content_image', 'bg_image'];
                            if (imageKeys.includes(key) && (value.includes('.jpg') || value.includes('.png') || value.includes('.webp'))) {
                                images.push({ url: value });
                            }
                            // Shortcode check
                            let match;
                            while ((match = shortcodeRegex.exec(value)) !== null) {
                                images.push({ url: match[1] });
                            }
                        } else if (typeof value === 'object') {
                            traverse([value]); // Recurse into nested objects
                        }
                    }
                }
            }
        }
    }

    traverse(data);
    return Array.from(new Map(images.map(img => [img.url, img])).values()); // Return unique images
}

/**
 * Uploads an image to the WordPress media library, with optional resizing and cropping.
 * It can handle a URL string or a File object.
 * @param source The URL string of the image or a File object.
 * @param seoFilename A desired filename for SEO purposes.
 * @param imageMetadata Metadata for the image (title, alt, etc.).
 * @param wpApi Initialized Axios instance for WordPress API.
 * @param width Optional. The target width for the image. If null, resizing is skipped for this dimension.
 * @param height Optional. The target height for the image. If null, resizing is skipped for this dimension.
 * @param position Optional. The crop position (e.g., 'center', 'top').
 * @returns The ID of the newly uploaded media item.
 */
export async function uploadImageToWordPress(
  source: File | string,
  seoFilename: string,
  imageMetadata: { title: string; alt_text: string; caption: string; description: string; },
  wpApi: AxiosInstance,
  width?: number | null,
  height?: number | null,
  position?: string,
): Promise<number> {
    try {
        let imageBuffer: Buffer;

        if (typeof source === 'string') {
            const sanitizedUrl = source.startsWith('http') ? source : `https://${source.replace(/^(https?:\/\/)?/, '')}`;
            const imageResponse = await axios.get(sanitizedUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });
            imageBuffer = Buffer.from(imageResponse.data);
        } else {
            imageBuffer = Buffer.from(await source.arrayBuffer());
        }
        
        let sharpInstance = sharp(imageBuffer);

        if (width || height) {
            sharpInstance = sharpInstance.resize(width, height, { 
                fit: (width && height) ? 'cover' : 'inside', 
                position: position as any || 'center' 
            });
        } else {
            sharpInstance = sharpInstance.resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
            });
        }
        
        const finalBuffer = await sharpInstance.webp({ quality: 80 }).toBuffer();
        const finalContentType = 'image/webp';
        const finalFilename = seoFilename.endsWith('.webp') ? seoFilename : seoFilename.replace(/\.[^/.]+$/, "") + ".webp";

        const formData = new FormData();
        formData.append('file', finalBuffer, finalFilename);
        
        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${finalFilename}`,
            },
        });
        
        const mediaId = mediaResponse.data.id;
        if (!mediaId) {
            throw new Error("WordPress did not return a media ID after upload.");
        }
        
        // Update metadata in a separate request
        await wpApi.post(`/media/${mediaId}`, {
            title: imageMetadata.title,
            alt_text: imageMetadata.alt_text,
            caption: imageMetadata.caption,
            description: imageMetadata.description,
        });
        
        return mediaId;

    } catch (uploadError: any) {
        let errorMsg = `Error al procesar la imagen.`;
        if (uploadError.response?.data?.message) {
            errorMsg += ` Razón: ${uploadError.response.data.message}`;
            if (uploadError.response.status === 401 || uploadError.response.status === 403) {
                errorMsg += ' Esto es probablemente un problema de permisos. Asegúrate de que el usuario de la Contraseña de Aplicación tiene el rol de "Editor" o "Administrador" en WordPress.';
            }
        } else {
            errorMsg += ` Razón: ${uploadError.message}`;
        }
        console.error(errorMsg, uploadError.response?.data || uploadError);
        throw new Error(errorMsg);
    }
}

/**
 * Finds a WP post category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * This version uses precise API searches to avoid duplicates on sites with many categories.
 * @param pathString The category path string.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @param taxonomy The taxonomy slug (e.g., 'category', 'product_cat').
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateWpCategoryByPath(pathString: string, wpApi: AxiosInstance, taxonomy: string = 'category'): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }
    console.log(`[API Helper] Finding or creating category path: "${pathString}" in taxonomy "${taxonomy}"`);

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;

    for (const part of pathParts) {
        console.log(`[API Helper] Processing path part: "${part}" with parent ID: ${parentId}`);
        // Search for an existing term with the exact name and parent
        const { data: searchResult } = await wpApi.get(`/${taxonomy}`, {
            params: {
                search: part,
                parent: parentId,
                per_page: 1, // We only need to know if at least one exists
                hide_empty: false,
            }
        });
        
        // Find an exact match from the search results
        const foundTerm = searchResult.find((term: any) => term.name.toLowerCase() === part.toLowerCase() && term.parent === parentId);

        if (foundTerm) {
            console.log(`[API Helper] Found existing term for "${part}" with ID: ${foundTerm.id}`);
            parentId = foundTerm.id;
        } else {
            // If no exact match is found, create the new term
            console.log(`[API Helper] No existing term found for "${part}". Creating...`);
            const { data: newTerm } = await wpApi.post(`/${taxonomy}`, {
                name: part,
                parent: parentId,
            });
            if (!newTerm || !newTerm.id) {
                throw new Error(`Failed to create category term "${part}".`);
            }
            console.log(`[API Helper] Created new term for "${part}" with ID: ${newTerm.id}`);
            parentId = newTerm.id;
        }
        finalCategoryId = parentId;
    }

    console.log(`[API Helper] Final category ID for path "${pathString}" is: ${finalCategoryId}`);
    return finalCategoryId;
}


/**
 * Finds tags by name or creates them if they don't exist in WordPress.
 * @param tagNames An array of tag names.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns A promise that resolves to an array of tag IDs.
 */
export async function findOrCreateTags(tagNames: string[], wpApi: AxiosInstance): Promise<number[]> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }
  const tagIds: number[] = [];
  console.log(`[API Helper] Finding or creating tags:`, tagNames);

  for (const name of tagNames) {
    try {
      const searchResponse = await wpApi.get('/tags', { params: { search: name, per_page: 1 } });
      const existingTag = searchResponse.data.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase());

      if (existingTag) {
        console.log(`[API Helper] Found existing tag "${name}" with ID: ${existingTag.id}`);
        tagIds.push(existingTag.id);
      } else {
        console.log(`[API Helper] No existing tag found for "${name}". Creating...`);
        const createResponse = await wpApi.post('/tags', { name });
        console.log(`[API Helper] Created new tag "${name}" with ID: ${createResponse.data.id}`);
        tagIds.push(createResponse.data.id);
      }
    } catch (error: any) {
        // Handle race conditions where a tag might be created between the search and the create call
        if (error.response?.data?.code === 'term_exists') {
            const existingId = error.response.data.data?.term_id;
            if (existingId) {
                console.log(`[API Helper] Tag "${name}" already existed (race condition), using ID: ${existingId}`);
                tagIds.push(existingId);
            } else {
                 console.error(`Tag "${name}" exists but could not retrieve its ID from the error response.`);
            }
        } else {
            console.error(`Failed to find or create tag "${name}":`, error.response?.data || error.message);
        }
    }
  }
  console.log(`[API Helper] Final tag IDs:`, tagIds);
  return tagIds;
}

export function validateHmac(searchParams: URLSearchParams, clientSecret: string): boolean {
    const hmac = searchParams.get('hmac');
    if (!hmac) return false;

    const params = new URLSearchParams(searchParams.toString());
    params.delete('hmac');
    
    params.sort();

    const calculatedHmac = crypto
        .createHmac('sha256', clientSecret)
        .update(params.toString())
        .digest('hex');

    try {
        return crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(calculatedHmac, 'hex'));
    } catch {
        return false;
    }
}

/**
 * Gets the applicable prompt template based on a hierarchical lookup.
 * 1. Connection-specific prompt.
 * 2. User-specific prompt (for super admin fallback).
 * 3. System-wide default prompt.
 * @param promptKey The key of the prompt to retrieve (e.g., 'productDescription').
 * @param connectionKey The key of the active connection.
 * @param settingsSource The user or company settings document data.
 * @returns The most specific prompt string available.
 */
async function getPromptForConnection(
    promptKey: string,
    connectionKey: string | null,
    settingsSource: admin.firestore.DocumentData | undefined,
    entityRef: admin.firestore.DocumentReference,
): Promise<string> {
    const defaultPrompt = PROMPT_DEFAULTS[promptKey]?.default;
    if (!defaultPrompt) throw new Error(`Default prompt for key "${promptKey}" not found.`);
    if (!adminDb) return defaultPrompt;

    try {
        // 1. Try to get from connection-specific prompts
        if (connectionKey) {
            const promptDocRef = entityRef.collection('prompts').doc(connectionKey);
            const promptDoc = await promptDocRef.get();
            if (promptDoc.exists && promptDoc.data()?.prompts?.[promptKey]) {
                console.log(`[API Helper] Using prompt '${promptKey}' from connection '${connectionKey}'.`);
                return promptDoc.data()!.prompts[promptKey];
            }
        }
        
        // 2. Fallback to user/company level prompts (old system)
        if (settingsSource?.prompts?.[promptKey]) {
            console.log(`[API Helper] Using prompt '${promptKey}' from top-level settings (legacy fallback).`);
            return settingsSource.prompts[promptKey];
        }

        console.log(`[API Helper] Using default prompt for '${promptKey}'.`);
        return defaultPrompt;
    } catch (error) {
        console.error(`Error fetching prompt '${promptKey}', using default.`, error);
        return defaultPrompt;
    }
}


/**
 * Retrieves API clients and applicable prompts based on the user's active configuration.
 *
 * @param uid The UID of the user making the request.
 * @returns An object containing initialized API clients and settings info.
 * @throws If no settings or active connection are found.
 */
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }

  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found. Cannot determine settings.');
  const userData = userDoc.data()!;
  
  const entityType = userData.companyId ? 'companies' : 'user_settings';
  const entityId = userData.companyId || uid;
  const entityRef = adminDb.collection(entityType).doc(entityId);
  const settingsDoc = await entityRef.get();
  
  const settingsSource = settingsDoc.exists ? settingsDoc.data() : undefined;
  
  if (!settingsSource) {
    throw new Error('No settings found for the user or their company. Please configure API connections in Settings.');
  }
  
  const allConnections = settingsSource.connections || {};
  const activeConnectionKey = settingsSource.activeConnectionKey;

  // NEW: Prepare a unified prompts object
  const finalPrompts: Record<string, string> = {};
  for (const key in PROMPT_DEFAULTS) {
      finalPrompts[key] = await getPromptForConnection(key, activeConnectionKey, settingsSource, entityRef);
  }

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
    return { wooApi: null, wpApi: null, shopifyApi: null, activeConnectionKey: null, settings: settingsSource, prompts: finalPrompts };
  }

  const activeConnection = allConnections[activeConnectionKey];
  
  // Auto-migrate old connection objects by adding a default 'prompts' object if it doesn't exist
  if (activeConnection && !activeConnection.prompts && Object.keys(PROMPT_DEFAULTS).length > 0) {
      console.log(`[API Helper] Migrating old connection object: ${activeConnectionKey}`);
      activeConnection.prompts = PROMPT_DEFAULTS;
      await entityRef.set({
          connections: {
              [activeConnectionKey]: activeConnection
          }
      }, { merge: true });
  }

  
  const wooApi = createWooCommerceApi({
    url: activeConnection.wooCommerceStoreUrl,
    consumerKey: activeConnection.wooCommerceApiKey,
    consumerSecret: activeConnection.wooCommerceApiSecret,
  });

  const wpApi = createWordPressApi({
    url: activeConnection.wordpressApiUrl,
    username: activeConnection.wordpressUsername,
    applicationPassword: activeConnection.wordpressApplicationPassword,
  });

  const shopifyApi = createShopifyApi({
    url: activeConnection.shopifyStoreUrl,
    accessToken: activeConnection.shopifyApiPassword,
  });

  return { wooApi, wpApi, shopifyApi, activeConnectionKey, settings: settingsSource, prompts: finalPrompts };
}

// Function to replace an image URL within Elementor data, also updating the ID.
export function replaceImageUrlInElementor(data: any, oldUrl: string, newUrl: string, newId: number): { replaced: boolean, data: any } {
    let replaced = false;

    function traverse(obj: any): any {
        if (!obj) return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => traverse(item));
        }

        if (typeof obj === 'object') {
            const newObj: { [key: string]: any } = {};
            let isImageObject = false;

            if (typeof obj.url === 'string' && obj.url === oldUrl) {
                isImageObject = true;
            }

            if (isImageObject) {
                 newObj.url = newUrl;
                 newObj.id = newId;
                 replaced = true;
                 for (const key in obj) {
                     if (key !== 'url' && key !== 'id') {
                         newObj[key] = obj[key];
                     }
                 }
            } else {
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                         newObj[key] = traverse(obj[key]);
                    }
                }
            }
            return newObj;
        }
        return obj;
    }

    const newData = traverse(data);
    return { replaced, data: newData };
}


/**
 * Recursively finds image URLs and their context in Elementor JSON data.
 * This is a more robust version that checks multiple common keys for images.
 * @param {any} data The Elementor data (elements array, section, column, etc.).
 * @returns {Array} An array of objects, each containing the image URL, ID, width, and height.
 */
export function findImageUrlsInElementor(data: any): { url: string; id: number | null, width: number | null, height: number | null }[] {
    const images: { url: string; id: number | null, width: number | null, height: number | null }[] = [];
    if (!data) return images;

    if (Array.isArray(data)) {
        data.forEach(item => images.push(...findImageUrlsInElementor(item)));
    } else if (typeof data === 'object' && data !== null) {
        
        const imageKeys = ['image', 'background_image', 'background_overlay_image', 'background_a_image', 'background_b_image', 'hover_image'];
        const repeaterKeys = ['slides', 'gallery', 'carousel'];

        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key];
                if (imageKeys.includes(key) && typeof value === 'object' && value !== null && typeof value.url === 'string' && value.url) {
                    if (!value.url.includes('placeholder.png')) {
                        images.push({ url: value.url, id: value.id || null, width: value.width || null, height: value.height || null });
                    }
                } else if (key === 'gallery' && Array.isArray(value)) { // Specifically handle 'gallery' widget
                    value.forEach(galleryImage => {
                        if (typeof galleryImage === 'object' && galleryImage !== null && typeof galleryImage.url === 'string' && galleryImage.url) {
                            if (!galleryImage.url.includes('placeholder.png')) {
                                images.push({ url: galleryImage.url, id: galleryImage.id || null, width: null, height: null });
                            }
                        }
                    });
                } else if (repeaterKeys.includes(key) && Array.isArray(value)) {
                    value.forEach(item => images.push(...findImageUrlsInElementor(item)));
                } else if (typeof value === 'object' && value !== null) {
                    images.push(...findImageUrlsInElementor(value));
                }
            }
        }
    }
    
    // Return a unique set of images based on URL
    return Array.from(new Map(images.map(img => [img.url, img])).values());
}
```
</change>
<change>
<file>/src/app/api/generate-description/route.ts</file>
<content><![CDATA[

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import Handlebars from 'handlebars';

const FullProductOutputSchema = z.object({
  name: z.string().describe('A new, SEO-friendly product title. It should start with the base name and be enriched with the descriptive context.'),
  shortDescription: z.string().describe('A brief, catchy summary of the product (1-2 sentences). Must use HTML for formatting.'),
  longDescription: z.string().describe('A detailed, persuasive, and comprehensive description of the product. Must use HTML for formatting.'),
  tags: z.array(z.string()).describe('An array of 5 to 10 relevant SEO keywords/tags for the product, in the specified {{language}}.'),
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});

const ImageMetaOnlySchema = z.object({
  imageTitle: z.string().describe('A concise, SEO-friendly title for the product images.'),
  imageAltText: z.string().describe('A descriptive alt text for SEO, describing the image for visually impaired users.'),
  imageCaption: z.string().describe('An engaging caption for the image, suitable for the media library.'),
  imageDescription: z.string().describe('A detailed description for the image media library entry.'),
});

async function getEntityRef(uid: string, cost: number): Promise<[FirebaseFirestore.DocumentReference, number]> {
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    const userData = userDoc.data();

    if (userData?.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), cost];
    }
    return [adminDb.collection('user_settings').doc(uid), cost];
}


export async function POST(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No se proporcionó token de autenticación.', message: 'Por favor, inicia sesión de nuevo.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    uid = decodedToken.uid;
  } catch (error: any) {
     return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
  }

  try {
    const body = await req.json();

    const clientInputSchema = z.object({
        baseProductName: z.string().optional(),
        productName: z.string().min(1),
        productType: z.string(),
        categoryName: z.string().optional(),
        tags: z.string().optional(),
        language: z.enum(['Spanish', 'English', 'French', 'German', 'Portuguese']).default('Spanish'),
        groupedProductIds: z.array(z.number()).optional(),
        mode: z.enum(['full_product', 'image_meta_only']).default('full_product'),
    });

    const validationResult = clientInputSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const clientInput = validationResult.data;
    
    const { wooApi, prompts } = await getApiClientsForUser(uid);
    
    let groupedProductsList = 'N/A';
    if (clientInput.productType === 'grouped' && clientInput.groupedProductIds && clientInput.groupedProductIds.length > 0) {
        if (wooApi) {
             try {
                const response = await wooApi.get('products', { include: clientInput.groupedProductIds, per_page: 100, lang: 'all' });
                if (response.data && response.data.length > 0) {
                    groupedProductsList = response.data.map((p: any) => `* Product: ${p.name}\\n* Details: ${p.short_description || p.description || 'No description'}`).join('\\n\\n');
                }
            } catch (e: unknown) {
                console.error('Failed to fetch details for grouped products:', e);
                groupedProductsList = 'Error fetching product details.';
            }
        }
    }
    
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });
    
    let promptTemplate: string;
    let outputSchema: z.ZodTypeAny;
    let creditCost: number;

    if (clientInput.mode === 'image_meta_only') {
      outputSchema = ImageMetaOnlySchema;
      promptTemplate = prompts.productDescription; 
      creditCost = 1;
    } else { // full_product
      outputSchema = FullProductOutputSchema;
      promptTemplate = prompts.productDescription;
      creditCost = 10;
    }
    
    const cleanedCategoryName = clientInput.categoryName ? clientInput.categoryName.replace(/—/g, '').trim() : '';

    const template = Handlebars.compile(promptTemplate, { noEscape: true });
    const templateData = { ...clientInput, categoryName: cleanedCategoryName, tags: clientInput.tags || '', groupedProductsList };
    const finalPrompt = template(templateData);
    
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const aiContent = outputSchema.parse(JSON.parse(response.text()));
    
    if (!aiContent) {
      throw new Error('AI returned an empty response.');
    }
    
    const [entityRef, cost] = await getEntityRef(uid, creditCost);
    await entityRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(cost) }, { merge: true });

    return NextResponse.json(aiContent);

  } catch (error: any) {
    console.error('🔥 Error in /api/generate-description:', error);
    if (error.message && error.message.includes('503')) {
        return NextResponse.json({ error: 'El servicio de IA está sobrecargado en este momento. Por favor, inténtalo de nuevo más tarde.' }, { status: 503 });
    }
    let errorMessage = 'La IA falló: ' + (error instanceof Error ? error.message : String(error));
    if (error instanceof z.ZodError) {
        errorMessage = 'La IA falló: ' + JSON.stringify(error.errors);
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
