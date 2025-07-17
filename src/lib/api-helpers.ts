
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
    
    if (!partnerAppData.data.clientId || !partnerAppData.data.clientSecret) {
      throw new Error("El Client ID o Client Secret no están configurados en los ajustes globales de Shopify.");
    }

    return partnerAppData.data;
}


function extractHeadingsRecursive(elements: any[], widgets: ExtractedWidget[]): void {
    if (!elements || !Array.isArray(elements)) return;

    for (const element of elements) {
        if (element.elType === 'widget' && element.widgetType === 'heading' && element.settings?.title) {
            widgets.push({
                id: element.id,
                tag: element.settings.header_size || 'h2',
                text: element.settings.title,
                type: 'heading', // Added for clarity on the frontend
            });
        }
        
        if (element.elements && element.elements.length > 0) {
            extractHeadingsRecursive(element.elements, widgets);
        }
    }
}

export function extractElementorHeadings(elementorDataString: string): ExtractedWidget[] {
    try {
        const widgets: ExtractedWidget[] = [];
        if (!elementorDataString) return widgets;
        const elementorData = JSON.parse(elementorDataString);
        extractHeadingsRecursive(elementorData, widgets);
        return widgets;
    } catch (e) {
        console.error("Failed to parse or extract Elementor headings", e);
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
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
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
 * with items from an array of translated strings.
 * @param data A deep copy of the original 'elements' array or nested object/array.
 * @param translatedTexts A mutable array of translated strings.
 * @returns The Elementor data structure with translated text.
 */
function replaceElementorTextsRecursive(data: any, translatedTexts: string[]): any {
    if (!data) return data;

    if (Array.isArray(data)) {
        return data.map(item => replaceElementorTextsRecursive(item, translatedTexts));
    }

    if (typeof data === 'object') {
        const newData = { ...data };
        const keysToTranslate = [
            'title', 'editor', 'text', 'button_text', 'header_title', 'header_subtitle',
            'description', 'cta_text', 'label', 'placeholder', 'heading', 'sub_heading',
            'alert_title', 'alert_description',
            // Added based on user's JSON from theme "The7"
            'title_text', 'description_text', 'list_title'
        ];

        for (const key in newData) {
            if (Object.prototype.hasOwnProperty.call(newData, key)) {
                const value = newData[key];

                if (keysToTranslate.includes(key) && typeof value === 'string' && value.trim() !== '') {
                    if (translatedTexts.length > 0) {
                        newData[key] = translatedTexts.shift();
                    }
                } else if (typeof value === 'object' && value !== null) {
                    newData[key] = replaceElementorTextsRecursive(value, translatedTexts);
                }
            }
        }
        return newData;
    }

    return data;
}

export function replaceElementorTexts(elementorData: any, translatedTexts: string[]): any {
  if (!elementorData || !Array.isArray(elementorData)) return elementorData;
  return replaceElementorTextsRecursive(elementorData, translatedTexts);
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
                // Check if the current item is an image-box and contains the image
                if (item.widgetType === 'the7_image_box_widget' && settings.image?.url === imageUrl) {
                    context = settings.description_text?.replace(/<[^>]+>/g, ' ').trim() || '';
                    if (context) return;
                }
                // Check if it's a standard image widget
                if (item.widgetType === 'image' && settings.image?.url === imageUrl) {
                    context = settings.caption || settings.title_text || '';
                    if (context) return;
                }
            }

            if (item.elements && item.elements.length > 0) {
                traverse(item.elements);
            }
        }
    }

    traverse(elements);
    return context;
}

/**
 * Uploads an image to the WordPress media library. It can handle a URL string or a File object.
 * @param source The URL string of the image or a File object.
 * @param seoFilename A desired filename for SEO purposes.
 * @param imageMetadata Metadata for the image (title, alt, etc.).
 * @param wpApi Initialized Axios instance for WordPress API.
 * @returns The ID of the newly uploaded media item.
 */
export async function uploadImageToWordPress(
  source: File | string,
  seoFilename: string,
  imageMetadata: { title: string; alt_text: string; caption: string; description: string; },
  wpApi: AxiosInstance
): Promise<number> {
    try {
        let imageBuffer: Buffer;
        let contentType: string;

        if (typeof source === 'string') {
            const imageResponse = await axios.get(source, {
                responseType: 'arraybuffer',
            });
            imageBuffer = Buffer.from(imageResponse.data);
            contentType = imageResponse.headers['content-type'] || 'application/octet-stream';
        } else {
            imageBuffer = Buffer.from(await source.arrayBuffer());
            contentType = source.type;
        }
        
        const formData = new FormData();
        formData.append('file', imageBuffer, {
            filename: seoFilename,
            contentType: contentType,
        });
        formData.append('title', imageMetadata.title);
        formData.append('alt_text', imageMetadata.alt_text);
        formData.append('caption', imageMetadata.caption);
        formData.append('description', imageMetadata.description);

        const mediaResponse = await wpApi.post('/media', formData, {
            headers: {
                ...formData.getHeaders(),
                'Content-Disposition': `attachment; filename=${seoFilename}`,
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
 * Finds a category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wooApi An initialized WooCommerce API client.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateCategoryByPath(pathString: string, wooApi: WooCommerceRestApiType): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    const allCategoriesResponse = await wooApi.get("products/categories", { per_page: 100 });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            const { data: newCategory } = await wooApi.post("products/categories", {
                name: part,
                parent: parentId,
            });
            allCategories.push(newCategory);
            parentId = newCategory.id;
        }
        finalCategoryId = parentId;
    }

    return finalCategoryId;
}

/**
 * Finds a WP post category by its path (e.g., "Parent > Child") or creates it if it doesn't exist.
 * @param pathString The category path string.
 * @param wpApi An initialized Axios instance for the WordPress API.
 * @returns The ID of the final category in the path.
 */
export async function findOrCreateWpCategoryByPath(pathString: string, wpApi: AxiosInstance): Promise<number | null> {
    if (!pathString || !pathString.trim()) {
        return null;
    }

    const pathParts = pathString.split('>').map(part => part.trim());
    let parentId = 0;
    let finalCategoryId: number | null = null;
    
    const allCategoriesResponse = await wpApi.get("/categories", { params: { per_page: 100 } });
    const allCategories = allCategoriesResponse.data;

    for (const part of pathParts) {
        let foundCategory = allCategories.find(
            (cat: any) => cat.name.toLowerCase() === part.toLowerCase() && cat.parent === parentId
        );

        if (foundCategory) {
            parentId = foundCategory.id;
        } else {
            const { data: newCategory } = await wpApi.post("/categories", {
                name: part,
                parent: parentId,
            });
            allCategories.push(newCategory);
            parentId = newCategory.id;
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
        console.error(`Failed to find or create tag "${name}":`, error.response?.data || error.message);
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
 * Retrieves API clients based on the user's active configuration, correctly
 * handling user-specific vs. company-wide settings.
 *
 * @param uid The UID of the user making the request.
 * @returns An object containing initialized API clients and settings info.
 * @throws If no settings or active connection are found.
 */
export async function getApiClientsForUser(uid: string): Promise<ApiClients> {
  if (!adminDb) {
    throw new Error('Firestore admin is not initialized.');
  }
  
  const userDocRef = await adminDb.collection('users').doc(uid).get();
  if (!userDocRef.exists) {
      throw new Error('User not found. Cannot determine settings.');
  }
  const userData = userDocRef.data()!;
  
  let settingsSource: admin.firestore.DocumentData | undefined;
  
  if (userData.companyId) {
      const companyDoc = await adminDb.collection('companies').doc(userData.companyId).get();
      settingsSource = companyDoc.exists ? companyDoc.data() : undefined;
  }
  
  // Fallback to personal settings if no company or company doc not found
  if (!settingsSource) {
      const userSettingsDoc = await adminDb.collection('user_settings').doc(uid).get();
      settingsSource = userSettingsDoc.exists ? userSettingsDoc.data() : undefined;
  }
  
  if (!settingsSource) {
    throw new Error('No settings found for user or their company. Please configure API connections in Settings.');
  }
  
  const allConnections = settingsSource.connections || {};
  const activeConnectionKey = settingsSource.activeConnectionKey;

  if (!activeConnectionKey || !allConnections || !allConnections[activeConnectionKey]) {
    throw new Error('No active API connection is configured. Please select or create one in Settings.');
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
    console.log(`[Elementor Replace] Iniciando búsqueda recursiva para reemplazar ${oldUrl}`);

    function traverse(obj: any): any {
        if (!obj) return obj;

        if (Array.isArray(obj)) {
            return obj.map(item => traverse(item));
        }

        if (typeof obj === 'object') {
            const newObj: { [key: string]: any } = {};
            let isImageObject = false;

            // Check if this object directly represents an image
            if (typeof obj.url === 'string' && obj.url === oldUrl) {
                isImageObject = true;
            }

            if (isImageObject) {
                 console.log(`[Elementor Replace] URL encontrada en objeto de imagen. Reemplazando ID y URL.`);
                 newObj.url = newUrl;
                 newObj.id = newId;
                 replaced = true;
                 // Copy other properties from the original image object
                 for (const key in obj) {
                     if (key !== 'url' && key !== 'id') {
                         newObj[key] = obj[key];
                     }
                 }
            } else {
                 // If not an image object itself, traverse its properties
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
    console.log(`[Elementor Replace] Búsqueda finalizada. ¿Se reemplazó? ${replaced}`);
    return { replaced, data: newData };
}
