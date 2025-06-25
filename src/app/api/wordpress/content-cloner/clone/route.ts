
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, translateContent } from '@/lib/api-helpers';
import { z } from 'zod';
import _ from 'lodash';

const cloneSchema = z.object({
  sourceId: z.number(),
  sourceType: z.enum(['Post', 'Page']),
});

async function findAndTranslateElementor(elementorJson: any, sourceTitle: string, targetLangFullName: string) {
    const textsToTranslate: string[] = [];
    const textPaths: { path: (string|number)[], key: string }[] = [];

    // Recursively find text content in Elementor JSON
    function findTexts(node: any, path: (string|number)[] = []) {
        if (!node) return;
        if (Array.isArray(node)) {
            node.forEach((item, index) => findTexts(item, [...path, index]));
        } else if (typeof node === 'object') {
            const widgetType = node.widgetType;
            const settings = node.settings;

            if (settings) {
                const textFields = ['editor', 'title', 'description', 'text', 'button_text', 'title_text', 'description_text'];
                textFields.forEach(key => {
                    if (settings[key] && typeof settings[key] === 'string' && settings[key].trim() !== '') {
                        textsToTranslate.push(settings[key]);
                        textPaths.push({ path: [...path, 'settings'], key });
                    }
                });
            }

            if(node.elements) {
                 findTexts(node.elements, [...path, 'elements']);
            }
        }
    }

    findTexts(elementorJson);
    if (textsToTranslate.length === 0) {
        return { translatedTitle: (await translateContent({ title: sourceTitle, content: ''}, targetLangFullName)).title, translatedElementorData: JSON.stringify(elementorJson) };
    }

    // Translate all found texts in a single batch call
    const translationPayload = {
        title: sourceTitle,
        content: textsToTranslate.join(' ||| ')
    };
    const translationResult = await translateContent(translationPayload, targetLangFullName);
    const translatedSnippets = translationResult.content.split(' ||| ').map(s => s.trim());
    const translatedTitle = translationResult.title;

    // Create a deep copy to avoid modifying the original
    let newElementorJson = _.cloneDeep(elementorJson);

    // Replace original text with translated text
    textPaths.forEach((item, index) => {
        if (translatedSnippets[index] !== undefined) {
             _.set(newElementorJson, [...item.path, item.key], translatedSnippets[index]);
        }
    });
    
    return { translatedTitle, translatedElementorData: JSON.stringify(newElementorJson) };
}


export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Auth token missing');
        uid = (await adminAuth.verifyIdToken(token)).uid;
    } catch (e: any) {
        return NextResponse.json({ error: 'Auth failed', message: e.message }, { status: 401 });
    }

    try {
        const body = await req.json();
        const validation = cloneSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { sourceId, sourceType } = validation.data;
        const { wpApi } = await getApiClientsForUser(uid);
        if (!wpApi) throw new Error('WordPress API is not configured');
        
        const sourceEndpoint = sourceType === 'Post' ? 'posts' : 'pages';
        const { data: sourcePost } = await wpApi.get(`/${sourceEndpoint}/${sourceId}`, { params: { context: 'edit' } });
        
        const sourceLang = sourcePost.lang || 'es';
        const targetLang = sourceLang === 'es' ? 'en' : 'es';
        const targetLangFullName = sourceLang === 'es' ? 'English' : 'Spanish';

        let translatedTitle: string;
        let translatedContent: string = '';
        let translatedMeta: any = {};
        
        const isElementor = !!sourcePost.meta?._elementor_version;

        if (isElementor && sourcePost.meta?._elementor_data) {
            let parsedElementorData;
            try {
                parsedElementorData = JSON.parse(sourcePost.meta._elementor_data);
            } catch (e) {
                throw new Error("Failed to parse Elementor data. It may be corrupted.");
            }
            
            const { translatedTitle: elTitle, translatedElementorData } = await findAndTranslateElementor(parsedElementorData, sourcePost.title.rendered, targetLangFullName);
            translatedTitle = elTitle;
            translatedMeta._elementor_data = translatedElementorData;
            translatedContent = '<p>Contenido gestionado por Elementor. Edite con Elementor para ver los cambios.</p>';

        } else {
            const translationResult = await translateContent({ title: sourcePost.title.rendered, content: sourcePost.content.rendered }, targetLangFullName);
            translatedTitle = translationResult.title;
            translatedContent = translationResult.content;
        }

        const { content: translatedMetaDesc } = await translateContent({ title: '', content: sourcePost.meta?._yoast_wpseo_metadesc || '' }, targetLangFullName);
        const { content: translatedFocusKw } = await translateContent({ title: '', content: sourcePost.meta?._yoast_wpseo_focuskw || '' }, targetLangFullName);
        
        if(translatedMetaDesc) translatedMeta._yoast_wpseo_metadesc = translatedMetaDesc;
        if(translatedFocusKw) translatedMeta._yoast_wpseo_focuskw = translatedFocusKw;

        const newPostPayload: any = {
            title: translatedTitle,
            content: translatedContent,
            status: 'draft',
            lang: targetLang,
            author: sourcePost.author,
            ...(Object.keys(translatedMeta).length > 0 && { meta: translatedMeta }),
        };

        if (sourceType === 'Post') {
            newPostPayload.categories = sourcePost.categories;
            newPostPayload.tags = sourcePost.tags;
        }

        const { data: newPost } = await wpApi.post(`/${sourceEndpoint}`, newPostPayload);

        const translations = {
            [sourceLang]: sourceId,
            [targetLang]: newPost.id
        };
        
        const siteUrl = wpApi.defaults.baseURL?.replace('/wp-json/wp/v2', '');
        if (!siteUrl) throw new Error("Could not determine base site URL.");

        const linkEndpoint = `${siteUrl}/wp-json/custom/v1/link-translations`;
        await wpApi.post(linkEndpoint, { translations });

        return NextResponse.json({ success: true, message: 'Clonación completada', newPost });
    } catch (error: any) {
        console.error("Error in clone endpoint:", error.response?.data || error.message);
        return NextResponse.json({ error: "Failed to clone content", message: error.message }, { status: 500 });
    }
}
