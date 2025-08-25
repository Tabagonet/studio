// src/lib/api-helpers.ts
import { admin, adminDb } from '@/lib/firebase-admin';
import type * as admin_types from 'firebase-admin';
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
  settings: admin_types.firestore.DocumentData | undefined;
  prompts: Record<string, string>; // NEW: Will hold the applicable prompts
}

export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!admin.firestore) {
    throw new Error('Firestore admin is not initialized.');
  }
  const adminDb = admin.firestore();

  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found. Cannot determine settings.');
  const userData = userDoc.data()!;
  
  const [entityRef] = await getEntityRef(uid);
  const settingsDoc = await entityRef.get();
  
  const settingsSource = settingsDoc.exists ? settingsDoc.data() : undefined;
  
  if (!settingsSource) {
    throw new Error('No settings found for the user or their company. Please configure API connections in Settings.');
  }
  
  const allConnections = settingsSource.connections || {};
  const activeConnectionKey = settingsSource.activeConnectionKey;

  // Prepare a unified prompts object
  const finalPrompts: Record<string, string> = {};
  for (const key in PROMPT_DEFAULTS) {
      finalPrompts[key] = await getPromptForConnection(key, activeConnectionKey, entityRef);
  }

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
    return { wooApi: null, wpApi: null, shopifyApi: null, activeConnectionKey: null, settings: settingsSource, prompts: finalPrompts };
  }

  const activeConnection = allConnections[activeConnectionKey];
  
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

/**
 * Retrieves Shopify Partner App credentials from Firestore. This function now reads
 * from the global configuration and returns all necessary credential fields.
 * @returns The credentials object including partner and custom app details.
 * @throws If credentials are not configured in the global settings.
 */
export async function getPartnerCredentials(): Promise<PartnerAppConnectionData> {
    const adminDb = admin.firestore();
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

export function replaceElementorTexts(data: any, translatedTextsOrMap: string[] | Map<string, string>): any {
    let textIndex = 0;
    
    function traverse(elements: any[]): any[] {
        return elements.map(element => {
            if (!element || typeof element !== 'object') return element;

            const newElement = { ...element };
            const keysToTranslate = [
                'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
                'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
                'alert_title', 'alert_description', 'title_text', 'description_text',
                'title_text_a', 'description_text_a', 'title_text_b', 'description_text_b'
            ];

            if (newElement.settings) {
                const newSettings: any = { ...newElement.settings };
                
                if (Array.isArray(translatedTextsOrMap)) {
                    for (const key of keysToTranslate) {
                        if (typeof newSettings[key] === 'string' && newSettings[key].trim() !== '') {
                            if (textIndex < translatedTextsOrMap.length) {
                                newSettings[key] = translatedTextsOrMap[textIndex];
                                textIndex++;
                            }
                        }
                    }
                } else { // It's a Map
                     if (translatedTextsOrMap.has(newElement.id)) {
                         const newText = translatedTextsOrMap.get(newElement.id);
                         if (newElement.widgetType === 'heading' && newSettings) {
                            newSettings.title = newText;
                         } else if (newElement.widgetType === 'text-editor' && newSettings) {
                             newSettings.editor = newText;
                         }
                     }
                }
                newElement.settings = newSettings;
            }

            if (newElement.elements && Array.isArray(newElement.elements)) {
                newElement.elements = traverse(newElement.elements);
            }

            return newElement;
        });
    }

    return traverse(data);
}

export function findElementorImageContext(elementorData: any[]): {
  url: string;
  id: number | null;
  alt: string | null;
  width: number | string | null;
  height: number | string | null;
  context: string;
  widgetType: string;
}[] {
  const images: {
    url: string;
    id: number | null;
    alt: string | null;
    width: number | string | null;
    height: number | string | null;
    context: string;
    widgetType: string;
  }[] = [];
  if (!elementorData || !Array.isArray(elementorData)) return images;

  const imageKeys = [
    'image', 'background_image', 'background_a_image', 'background_b_image',
    'featured_image', 'image_box_image', 'icon_box_image', 'media',
    'logo_image', 'image_overlay', 'background_overlay_image'
  ];

  function traverse(items: any[]) {
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;

      const settings = item.settings || {};
      const widgetType = item.widgetType || 'unknown';
      let contextText = settings.title || settings.title_text || settings.caption || `Widget: ${widgetType}`;

      const processImageObject = (imgObj: any, context: string, type: string, widgetSettings: any = {}) => {
        if (imgObj?.url) {
          const width = widgetSettings.image_size?.width || widgetSettings.image_custom_dimension?.width || imgObj.width || null;
          const height = widgetSettings.image_size?.height || widgetSettings.image_custom_dimension?.height || imgObj.height || null;
          const alt = imgObj.alt || widgetSettings.alt || null;
          images.push({
            url: imgObj.url,
            id: imgObj.id || null,
            alt,
            width,
            height,
            context,
            widgetType: type
          });
        }
      };

      if (settings.__dynamic__?.image && typeof settings.__dynamic__.image === 'string') {
        try {
          const tagString = settings.__dynamic__.image;
          const settingsMatch = tagString.match(/settings="([^"]+)"/);
          if (settingsMatch && settingsMatch[1]) {
            const decodedSettings = decodeURIComponent(settingsMatch[1].replace(/&quot;/g, '"'));
            const parsedSettings = JSON.parse(decodedSettings);
            const fallback = parsedSettings.fallback || (parsedSettings.settings?.fallback);
            if (fallback) {
              processImageObject(fallback, 'Imagen Destacada (Fallback)', widgetType, settings);
            }
          }
        } catch (e) {
          console.warn(`Could not parse dynamic settings for widget ${item.id}`, e);
        }
      }

      for (const key of imageKeys) {
        if (settings[key]) {
          processImageObject(settings[key], contextText, widgetType, settings);
        }
      }

      const arrayWidgets: { key: string, context: string }[] = [
        { key: 'slides', context: 'Slide' },
        { key: 'gallery', context: 'Galería' },
        { key: 'image_carousel', context: 'Carrusel' },
      ];

      for (const widget of arrayWidgets) {
        if (Array.isArray(settings[widget.key])) {
          settings[widget.key].forEach((slide: any) => {
            const slideContext = slide.heading || slide.title || `${widget.context} en ${widgetType}`;
            processImageObject(slide.image || slide.background_image || slide, slideContext, widgetType, slide);
          });
        }
      }

      if (item.elements && Array.isArray(item.elements) && item.elements.length > 0) {
        traverse(item.elements);
      }
    }
  }

  traverse(elementorData);
  return Array.from(new Map(images.map(img => [img.url, img])).values());
}

export async function enrichImageWithMediaData(image: any, wpApi: AxiosInstance) {
  // If we already have dimensions, there's no need to fetch. Return immediately.
  if (image && image.width && image.height) {
    return image;
  }
  
  if (!image.mediaId) {
    return image; // Can't fetch without an ID
  }

  try {
    const { data } = await wpApi.get(`/media/${image.mediaId}`, { params: { context: 'view', _fields: 'alt_text,media_details' }});
    // Return a new object with the original data plus the enriched fields.
    // This prioritizes existing data (like alt from scraper) but adds missing info.
    return {
      ...image,
      alt: image.alt ?? data.alt_text ?? null,
      width: image.width ?? data.media_details?.width ?? null,
      height: image.height ?? data.media_details?.height ?? null
    };
  } catch (e) {
    console.warn(`Could not fetch media data for image ${image.mediaId}. It may have been deleted.`, e);
    return image; // Return original image on failure
  }
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
                            const imageKeys = ['image', 'content_image', 'bg_image'];
                            if (imageKeys.includes(key) && (value.includes('.jpg') || value.includes('.png') || value.includes('.webp'))) {
                                images.push({ url: value });
                            }
                            let match;
                            while ((match = shortcodeRegex.exec(value)) !== null) {
                                images.push({ url: match[1] });
                            }
                        } else if (typeof value === 'object') {
                            traverse([value]);
                        }
                    }
                }
            }
        }
    }

    traverse(data);
    return Array.from(new Map(images.map(img => [img.url, img])).values());
}

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
        const { data: searchResult } = await wpApi.get(`/${taxonomy}`, {
            params: {
                search: part,
                parent: parentId,
                per_page: 100, // Fetch more results to be safe with non-exact search
                hide_empty: false,
            }
        });
        
        const foundTerm = Array.isArray(searchResult) 
            ? searchResult.find((term: any) => term.name.toLowerCase() === part.toLowerCase() && term.parent === parentId) 
            : null;

        if (foundTerm) {
            console.log(`[API Helper] Found existing term for "${part}" with ID: ${foundTerm.id}`);
            parentId = foundTerm.id;
        } else {
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

export async function findOrCreateTags(tagNames: string[], wpApi: AxiosInstance): Promise<number[]> {
  if (!tagNames || tagNames.length === 0) {
    return [];
  }
  const tagIds: number[] = [];
  console.log(`[API Helper] Finding or creating tags:`, tagNames);

  for (const name of tagNames) {
    try {
      const searchResponse = await wpApi.get('/tags', { params: { search: name, per_page: 1 } });
      const searchData = searchResponse.data;
      
      const existingTag = Array.isArray(searchData) 
        ? searchData.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase())
        : null;

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

export async function getPromptForConnection(
    promptKey: string,
    connectionKey: string | null,
    entityRef: admin_types.firestore.DocumentReference,
): Promise<string> {
    const defaultPrompt = PROMPT_DEFAULTS[promptKey as keyof typeof PROMPT_DEFAULTS]?.default;
    if (!defaultPrompt) throw new Error(`Default prompt for key "${promptKey}" not found.`);
    const adminDb = admin.firestore();
    if (!adminDb) return defaultPrompt;

    try {
        if (connectionKey) {
            const promptDocRef = entityRef.collection('prompts').doc(connectionKey);
            const promptDoc = await promptDocRef.get();
            
            if (promptDoc.exists && promptDoc.data()?.prompts?.[promptKey]) {
                console.log(`[API Helper] Using prompt '${promptKey}' from connection '${connectionKey}'.`);
                return promptDoc.data()!.prompts[promptKey];
            } 
            else if (!promptDoc.exists) {
                console.log(`[API Helper] Migrating: Prompt document for connection '${connectionKey}' not found. Creating with defaults...`);
                const defaultPrompts: Record<string, string> = {};
                for (const [key, config] of Object.entries(PROMPT_DEFAULTS)) {
                    defaultPrompts[key] = config.default;
                }
                await promptDocRef.set({ prompts: defaultPrompts, connectionKey: connectionKey, createdAt: admin.firestore.FieldValue.serverTimestamp() });
                console.log(`[API Helper] Migration complete for '${connectionKey}'.`);
                return defaultPrompts[promptKey] || defaultPrompt;
            }
        }
        
        const entityDoc = await entityRef.get();
        if (entityDoc.exists && entityDoc.data()?.prompts?.[promptKey]) {
            console.log(`[API Helper] Using fallback prompt '${promptKey}' from entity level.`);
            return entityDoc.data()!.prompts[promptKey];
        }

        console.log(`[API Helper] Using system default prompt for '${promptKey}'.`);
        return defaultPrompt;
    } catch (error) {
        console.error(`Error fetching prompt '${promptKey}', using system default. Error:`, error);
        return defaultPrompt;
    }
}

export async function getEntityRef(uid: string): Promise<[admin_types.firestore.DocumentReference, 'user' | 'company', string]> {
    const adminDb = admin.firestore();
    if (!adminDb) throw new Error("Firestore not configured.");

    const userDoc = await adminDb.collection('users').doc(uid).get();
    if (!userDoc.exists) throw new Error("User record not found.");
    const userData = userDoc.data()!;

    if (userData.companyId) {
        return [adminDb.collection('companies').doc(userData.companyId), 'company', userData.companyId];
    }
    return [adminDb.collection('user_settings').doc(uid), 'user', uid];
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
