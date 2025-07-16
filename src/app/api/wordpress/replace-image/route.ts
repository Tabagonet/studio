

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/wordpress-image-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from 'zod';
import * as cheerio from 'cheerio';
import FormData from "form-data";


const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

// Recursive function to find and replace image URLs within Elementor's data structure.
function replaceImageUrlInElementor(elements: any[], oldUrl: string, newUrl: string): { replaced: boolean; data: any[] } {
    console.log(`[Elementor Replace] Iniciando búsqueda recursiva para reemplazar ${oldUrl}`);
    let replaced = false;
    const newElements = JSON.parse(JSON.stringify(elements)); // Deep copy to avoid mutation issues

    function traverse(items: any[]) {
        for (const item of items) {
            if (!item || typeof item !== 'object') continue;
            
            // Handle complex widgets like sliders where images are in an array
            // e.g., slides: [ { background_image: { url: '...' } }, ... ]
            const arrayKeys = ['slides', 'gallery', 'image_carousel', 'icon_list_items']; 
            for (const arrayKey of arrayKeys) {
                if (item.settings && Array.isArray(item.settings[arrayKey])) {
                    for (const slide of item.settings[arrayKey]) {
                         if (slide.background_image?.url === oldUrl) {
                             console.log(`[Elementor Replace] URL encontrada en background_image de repeater. Reemplazando.`);
                             slide.background_image.url = newUrl;
                             replaced = true;
                         }
                          if (slide.image?.url === oldUrl) {
                             console.log(`[Elementor Replace] URL encontrada en imagen de repeater. Reemplazando.`);
                             slide.image.url = newUrl;
                             replaced = true;
                         }
                    }
                }
            }
            
            // Check direct settings of the element
            if (item.settings) {
                for (const key in item.settings) {
                    if (Object.prototype.hasOwnProperty.call(item.settings, key)) {
                        const setting = item.settings[key];
                        // Handles simple image widgets: { image: { url: '...' } }
                        // Also handles background images for sections/columns
                        if (typeof setting === 'object' && setting !== null && setting.url === oldUrl) {
                            console.log(`[Elementor Replace] URL encontrada en widget ${item.widgetType || 'unknown'}, setting ${key}. Reemplazando.`);
                            setting.url = newUrl;
                            replaced = true;
                        }
                    }
                }
            }


            // Recurse into nested elements
            if (item.elements && item.elements.length > 0) {
                traverse(item.elements);
            }
        }
    }
    
    traverse(newElements);
    console.log(`[Elementor Replace] Búsqueda finalizada. ¿Se reemplazó? ${replaced}`);
    return { replaced, data: newElements };
}


export async function POST(req: NextRequest) {
    console.log('[API replace-image] Petición POST recibida.');
    let uid: string;
    let authToken: string | undefined;
    try {
        authToken = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!authToken) throw new Error('Auth token missing');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        uid = (await adminAuth.verifyIdToken(authToken)).uid;
        console.log(`[API replace-image] Usuario autenticado: ${uid}`);
    } catch (e: any) {
        console.error('[API replace-image] Fallo de autenticación:', e.message);
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const { wpApi, wooApi } = await getApiClientsForUser(uid);
        if (!wpApi) {
            throw new Error('WordPress API is not configured.');
        }
        console.log('[API replace-image] Clientes API de WordPress obtenidos.');

        const formData = await req.formData();
        const newImageFile = formData.get('newImageFile') as File | null;
        const postId = Number(formData.get('postId'));
        const postType = formData.get('postType') as 'Post' | 'Page' | 'Producto';
        const oldImageUrl = formData.get('oldImageUrl') as string | null;

        console.log(`[API replace-image] Datos recibidos: postId=${postId}, postType=${postType}, oldImageUrl=${oldImageUrl}, newImageFile=${newImageFile?.name}`);

        if (!newImageFile || !postId || !postType || !oldImageUrl) {
            return NextResponse.json({ error: 'Faltan datos en la petición.' }, { status: 400 });
        }

        let post: any;
        const apiToUse = postType === 'Producto' ? wooApi : wpApi;
        if (!apiToUse) throw new Error(`API client for ${postType} is not configured.`);
        const endpoint = postType === 'Producto' ? `products/${postId}` : postType === 'Post' ? `/posts/${postId}` : `/pages/${postId}`;

        console.log(`[API replace-image] Obteniendo datos del post desde ${endpoint}`);
        const { data } = await apiToUse.get(endpoint, { params: { context: 'edit' } });
        post = postType === 'Producto' ? { ...data, title: { rendered: data.name }, content: { rendered: data.description }, meta: data.meta_data.reduce((obj: any, item: any) => ({...obj, [item.key]: item.value}), {}) } : data;
        
        const isElementor = !!post.meta?._elementor_data;
        console.log(`[API replace-image] Post "${post.title.rendered}" cargado. ¿Es Elementor? ${!!isElementor}`);

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", generationConfig: { responseMimeType: "application/json" } });

        const payload = { mode: 'generate_image_meta', language: 'Spanish', existingTitle: post.title.rendered, existingContent: post.content.rendered };
        const prompt = `You are an expert SEO specialist. Generate generic but descriptive SEO metadata for images based on a blog post's content. Respond with a JSON object: {"imageTitle": "title", "imageAltText": "alt text"}.\n\nGenerate generic image metadata in Spanish for a blog post titled "${payload.existingTitle}".`;
        
        console.log('[API replace-image] Generando metadatos de imagen con IA...');
        const result = await model.generateContent(prompt);
        const aiContent = JSON.parse(result.response.text());
        console.log('[API replace-image] Metadatos de IA generados:', aiContent);

        console.log('[API replace-image] Subiendo nueva imagen a WordPress...');
        
        // **FIX:** Create a new FormData object to pass to the upload-image endpoint
        const tempUploadFormData = new FormData();
        tempUploadFormData.append('imagen', newImageFile as Blob, newImageFile.name);
        
        const tempUploadResponse = await fetch(`${req.nextUrl.origin}/api/upload-image`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}` },
            body: tempUploadFormData,
        });

        if (!tempUploadResponse.ok) {
            const errorText = await tempUploadResponse.text();
            console.error(`[API replace-image] Error en la subida temporal: ${errorText}`);
            throw new Error('Failed to upload image to temporary server.');
        }
        
        const { url: tempUrl } = await tempUploadResponse.json();

        const newImageId = await uploadImageToWordPress(
            tempUrl,
            `${slugify(post.title.rendered || 'image')}-${Date.now()}.jpg`,
            {
                title: aiContent.imageTitle || post.title.rendered,
                alt_text: aiContent.imageAltText || post.title.rendered,
                caption: '',
                description: '',
            },
            wpApi
        );
        
        const newMediaData = await wpApi.get(`/media/${newImageId}`);
        const newImageUrl = newMediaData.data.source_url;
        console.log(`[API replace-image] Imagen subida con éxito. Nueva URL: ${newImageUrl}`);
        
        const updatePayload: { [key: string]: any } = {};
        let finalContent = '';

        if (isElementor) {
            console.log('[API replace-image] Procesando como página de Elementor.');
            const elementorData = JSON.parse(post.meta._elementor_data);
            const { replaced, data: newElementorData } = replaceImageUrlInElementor(elementorData, oldImageUrl, newImageUrl);
            if (replaced) {
                // For Elementor, the whole data structure needs to be saved in the meta field.
                updatePayload.meta = { ...post.meta, _elementor_data: JSON.stringify(newElementorData) };
                finalContent = JSON.stringify(newElementorData); // For response
                 console.log('[API replace-image] Payload de Elementor preparado para actualizar.');
            } else {
                 console.warn('[API replace-image] No se encontró la URL de la imagen antigua en los datos de Elementor. No se realizarán cambios en el contenido.');
            }
        } else {
            console.log('[API replace-image] Procesando como contenido estándar HTML.');
            let currentContent = post.content?.rendered || '';
            const newContent = currentContent.replace(new RegExp(oldImageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), newImageUrl);
            
            if (newContent !== currentContent) {
                if (postType === 'Producto') {
                    updatePayload.description = newContent;
                } else {
                    updatePayload.content = newContent;
                }
                finalContent = newContent;
                console.log('[API replace-image] Contenido HTML preparado para actualizar.');
            } else {
                 console.warn('[API replace-image] No se encontró la URL de la imagen antigua en el contenido HTML. No se realizarán cambios en el contenido.');
            }
        }

        if (Object.keys(updatePayload).length > 0) {
            console.log(`[API replace-image] Enviando payload de actualización al endpoint ${endpoint}...`);
            if (postType === 'Producto') {
                 await apiToUse.put(endpoint, updatePayload);
            } else {
                 await apiToUse.post(endpoint, updatePayload);
            }
             console.log(`[API replace-image] Actualización del post ${postId} completada.`);
        } else {
             console.log('[API replace-image] No hay cambios de contenido que guardar. La imagen se ha subido pero no se ha reemplazado en el post.');
        }
        
        await adminDb.collection('user_settings').doc(uid).set({ 
            aiUsageCount: admin.firestore.FieldValue.increment(1) 
        }, { merge: true });

        console.log('[API replace-image] Petición finalizada con éxito.');
        return NextResponse.json({ success: true, newContent: finalContent, newImageUrl, newImageAlt: aiContent.imageAltText });

    } catch (error: any) {
        console.error("[API replace-image] Error fatal:", error.response?.data || error.message);
        return NextResponse.json({ error: 'Failed to replace image', message: error.message }, { status: 500 });
    }
}
