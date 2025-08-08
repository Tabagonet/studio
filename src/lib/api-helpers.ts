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
        
        let processedBuffer = sharp(imageBuffer);

        if (width || height) {
            processedBuffer = processedBuffer.resize(width, height, { 
                fit: (width && height) ? 'cover' : 'inside', 
                position: position as any || 'center' 
            });
        } else {
            // Default optimization if no crop/resize is specified
            processedBuffer = processedBuffer.resize(1200, 1200, {
                fit: 'inside',
                withoutEnlargement: true,
            });
        }
        
        const finalBuffer = await processedBuffer.webp({ quality: 80 }).toBuffer();
        const finalContentType = 'image/webp';
        const finalFilename = seoFilename.endsWith('.webp') ? seoFilename : seoFilename.replace(/\.[^/.]+$/, "") + ".webp";


        const formData = new FormData();
        formData.append('file', finalBuffer, {
            filename: finalFilename,
            contentType: finalContentType,
        });
        formData.append('title', imageMetadata.title);
        formData.append('alt_text', imageMetadata.alt_text);
        formData.append('caption', imageMetadata.caption);
        formData.append('description', imageMetadata.description);

        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${finalFilename}`,
            },
        });

        return mediaResponse.data.id;

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
        console.error(errorMsg, uploadError.response?.data);
        throw new Error(errorMsg);
    }
}

/**
 * Finds a WP post category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @param taxonomy The taxonomy slug (e.g., 'category', 'product_cat').
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateWpCategoryByPath(pathString: string, wpApi: AxiosInstance, taxonomy: string = 'category'): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    // Fetch all terms for the taxonomy to check existence in memory
    const allTermsResponse = await wpApi.get(`/${taxonomy}`, { params: { per_page: 100 } });
    const allTerms = allTermsResponse.data;

    for (const part of pathParts) {
        let foundTerm = allTerms.find(
            (term: any) => term.name.toLowerCase() === part.toLowerCase() && term.parent === parentId
        );

        if (foundTerm) {
            parentId = foundTerm.id;
        } else {
            const { data: newTerm } = await wpApi.post(`/${taxonomy}`, {
                name: part,
                parent: parentId,
            });
            allTerms.push(newTerm); // Add to our in-memory list
            parentId = newTerm.id;
        }
        finalCategoryId = parentId;
    }

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

  for (const name of tagNames) {
    try {
      const searchResponse = await wpApi.get('/tags', { params: { search: name, per_page: 1 } });
      const existingTag = searchResponse.data.find((tag: any) => tag.name.toLowerCase() === name.toLowerCase());

      if (existingTag) {
        tagIds.push(existingTag.id);
      } else {
        const createResponse = await wpApi.post('/tags', { name });
        tagIds.push(createResponse.data.id);
      }
    } catch (error: any) {
        if (error.response?.data?.code === 'term_exists') {
            const existingId = error.response.data.data?.term_id;
            if (existingId) {
                tagIds.push(existingId);
            } else {
                 console.error(`Tag "${name}" exists but could not retrieve its ID from the error response.`);
            }
        } else {
            console.error(`Failed to find or create tag "${name}":`, error.response?.data || error.message);
        }
    }
  }
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
 * Retrieves API clients based on the user's active configuration.
 *
 * @param uid The UID of the user making the request.
 * @returns An object containing initialized API clients and settings info.
 * @throws If no settings or active connection are found.
 */
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }

  let settingsSource: admin.firestore.DocumentData | undefined;
  
  const userDoc = await adminDb.collection('users').doc(uid).get();
  if (!userDoc.exists) throw new Error('User not found. Cannot determine settings.');
  const userData = userDoc.data()!;

  if (userData.companyId) {
      const companyDoc = await adminDb.collection('companies').doc(userData.companyId).get();
      settingsSource = companyDoc.exists ? companyDoc.data() : undefined;
  }
  if (!settingsSource) {
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      settingsSource = userSettingsDoc.exists ? userSettingsDoc.data() : undefined;
  }
  
  if (!settingsSource) {
    throw new Error('No settings found for the user or their company. Please configure API connections in Settings.');
  }
  
  const allConnections = settingsSource.connections || {};
  const activeConnectionKey = settingsSource.activeConnectionKey;

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
    // Return nulls if no active connection, allowing checks to fail gracefully
    return { wooApi: null, wpApi: null, shopifyApi: null, activeConnectionKey: null, settings: settingsSource };
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

  return { wooApi, wpApi, shopifyApi, activeConnectionKey, settings: settingsSource };
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
