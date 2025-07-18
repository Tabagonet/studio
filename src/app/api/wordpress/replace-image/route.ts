

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress, replaceImageUrlInElementor, findElementorImageContext } from '@/lib/api-helpers';
import { GoogleGenerativeAI } from "@google/generative-ai";


const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};


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
        const width = formData.has('width') ? Number(formData.get('width')) : null;
        const height = formData.has('height') ? Number(formData.get('height')) : null;
        const mediaIdToDelete = formData.get('mediaIdToDelete') ? Number(formData.get('mediaIdToDelete')) : null;
        const cropPosition = formData.get('cropPosition') as "center" | "top" | "bottom" | "left" | "right" || "center";
        
        const isCropEnabled = (width !== null && width > 0) || (height !== null && height > 0);


        console.log(`[API replace-image] Datos recibidos: postId=${postId}, postType=${postType}, oldImageUrl=${oldImageUrl}, newImageFile=${newImageFile?.name}, cropEnabled=${isCropEnabled}, dimensions=${width}x${height}, mediaIdToDelete=${mediaIdToDelete}, cropPosition=${cropPosition}`);


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

        let imageContext = '';
        if (isElementor) {
            const elementorData = JSON.parse(post.meta._elementor_data);
            imageContext = findElementorImageContext(elementorData, oldImageUrl);
             if (imageContext) {
                console.log('[API replace-image] Contexto específico de widget encontrado:', imageContext);
            }
        }
        
        const promptContext = imageContext 
            ? `Utiliza la siguiente descripción del widget de la imagen como contexto principal: "${imageContext}"`
            : `Utiliza el contenido general de la página para el contexto: "${(post.content?.rendered || '').substring(0, 500)}..."`;


        const prompt = `You are an expert SEO specialist. Generate descriptive SEO metadata for an image, including a filename. The response must be a JSON object with "imageTitle", "imageAltText", and "seoFilename".

- **Inspiration Filename:** ${newImageFile.name}
- **Page Title:** ${post.title.rendered}
- **Context:** ${promptContext}

Generate the metadata now. The "seoFilename" should be a URL-friendly slug without the extension (e.g., 'transporte-olivos-centenarios'). The alt text should be a descriptive sentence.`;
        
        console.log('[API replace-image] Generando metadatos de imagen con IA...');
        const result = await model.generateContent(prompt);
        const aiContent = JSON.parse(result.response.text());
        console.log('[API replace-image] Metadatos de IA generados:', aiContent);

        console.log('[API replace-image] Subiendo nueva imagen a WordPress...');
        const seoFilename = aiContent.seoFilename ? `${aiContent.seoFilename}.webp` : `${slugify(post.title.rendered || 'image')}-${Date.now()}.webp`;
        
        const newImageId = await uploadImageToWordPress(
            newImageFile,
            seoFilename,
            {
                title: aiContent.imageTitle || post.title.rendered,
                alt_text: aiContent.imageAltText || post.title.rendered,
                caption: '',
                description: '',
            },
            wpApi,
            isCropEnabled ? width : null,
            isCropEnabled ? height : null,
            isCropEnabled ? cropPosition : undefined,
        );
        
        const newMediaData = await wpApi.get(`/media/${newImageId}`);
        const newImageUrl = newMediaData.data.source_url;
        console.log(`[API replace-image] Imagen subida con éxito. Nuevo ID: ${newImageId}, Nueva URL: ${newImageUrl}`);
        
        const updatePayload: { [key: string]: any } = {};
        let finalContent = '';

        if (isElementor) {
            console.log('[API replace-image] Procesando como página de Elementor.');
            const elementorData = JSON.parse(post.meta._elementor_data);
            const { replaced, data: newElementorData } = replaceImageUrlInElementor(elementorData, oldImageUrl, newImageUrl, newImageId);
            if (replaced) {
                updatePayload.meta = { ...post.meta, _elementor_data: JSON.stringify(newElementorData) };
                finalContent = JSON.stringify(newElementorData); 
                 console.log('[API replace-image] Payload de Elementor preparado para actualizar.');
            } else {
                 console.warn('[API replace-image] No se encontró la URL de la imagen antigua en los datos de Elementor. No se realizarán cambios en el contenido.');
            }
        } else {
            console.log('[API replace-image] Procesando como contenido HTML estándar.');
            const currentContent = postType === 'Producto' ? (post.description || '') : (post.content.rendered || '');
            if (currentContent && currentContent.includes(oldImageUrl)) {
                const updatedContent = currentContent.replace(new RegExp(oldImageUrl, 'g'), newImageUrl);
                if (postType === 'Producto') {
                    updatePayload.description = updatedContent;
                } else {
                    updatePayload.content = updatedContent;
                }
                finalContent = updatedContent;
                console.log('[API replace-image] Payload de contenido HTML preparado para actualizar.');
            } else {
                console.warn('[API replace-image] No se encontró la URL de la imagen antigua en el contenido HTML. No se realizarán cambios.');
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

             if (isElementor) {
                console.log(`[API replace-image] Regenerando CSS de Elementor para el post ${postId}...`);
                try {
                    const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
                    if (siteUrl) {
                        const regenerateEndpoint = `${siteUrl}/wp-json/custom/v1/regenerate-css/${postId}`;
                        await wpApi.post(regenerateEndpoint);
                        console.log(`[API replace-image] Regeneración de CSS solicitada con éxito.`);
                    }
                } catch (regenError: any) {
                    console.warn(`[API replace-image] No se pudo regenerar el CSS de Elementor:`, regenError.response?.data || regenError.message);
                }
             }
        } else {
             console.log('[API replace-image] No hay cambios de contenido que guardar. La imagen se ha subido pero no se ha reemplazado en el post.');
        }

        if (mediaIdToDelete) {
            console.log(`[API replace-image] Intentando eliminar la imagen antigua con ID de medio: ${mediaIdToDelete}`);
            try {
                await wpApi.delete(`/media/${mediaIdToDelete}`, { params: { force: true } });
                console.log(`[API replace-image] Imagen antigua (ID: ${mediaIdToDelete}) eliminada con éxito.`);
            } catch (deleteError: any) {
                console.warn(`[API replace-image] No se pudo eliminar la imagen antigua (ID: ${mediaIdToDelete}). Puede que ya no exista. Error:`, deleteError.response?.data?.message || deleteError.message);
            }
        }
        
        if (adminDb) {
            await adminDb.collection('user_settings').doc(uid).set({ 
                aiUsageCount: admin.firestore.FieldValue.increment(1) 
            }, { merge: true });
        }

        console.log('[API replace-image] Petición finalizada con éxito.');
        return NextResponse.json({ success: true, newContent: finalContent, newImageUrl, newImageAlt: aiContent.imageAltText });

    } catch (error: any) {
        console.error("[API replace-image] Error fatal:", error.response?.data || error.message);
        return NextResponse.json({ error: 'Failed to replace image', message: error.message }, { status: 500 });
    }
}
