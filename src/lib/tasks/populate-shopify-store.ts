
import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { createShopifyApi } from '@/lib/shopify';
import { GenerationInput, generateShopifyStoreContent } from '@/ai/flows/shopify-content-flow';
import type { ShopifyCreationJob } from '@/lib/types';
import type { AxiosInstance } from 'axios';


async function updateJobStatus(jobId: string, status: 'populating' | 'completed' | 'error' | 'assigned', logMessage: string, extraData: Record<string, any> = {}) {
    if (!adminDb) return;
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    console.log(`[Task Logic - Job ${jobId}] Updating status to ${status}. Log: "${logMessage}"`);
    await jobRef.update({
        status,
        ...extraData,
        logs: admin.firestore.FieldValue.arrayUnion({
            timestamp: new Date(),
            message: logMessage,
        }),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}


/**
 * @description Populates a Shopify store with content after authorization.
 * This is the main task that runs after a job is created.
 */
export async function populateShopifyStore(jobId: string) {
    if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        throw new Error("Firestore not available.");
    }
    
    await updateJobStatus(jobId, 'populating', 'Iniciando poblamiento de contenido. Generando contenido con IA...');
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    let shopifyApi: AxiosInstance | null = null;
    let jobData: ShopifyCreationJob;

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        jobData = jobDoc.data() as ShopifyCreationJob;

        if (!jobData.adminApiAccessToken || !jobData.storeDomain) {
            throw new Error("El token de acceso de Admin API o el dominio de la tienda no están presentes en el trabajo.");
        }

        shopifyApi = createShopifyApi({ url: jobData.storeDomain, accessToken: jobData.adminApiAccessToken });
        if (!shopifyApi) throw new Error("No se pudo crear el cliente de la API de Shopify.");

        // --- 1. Generate Content with AI ---
        const aiInput: GenerationInput = {
            storeName: jobData.storeName,
            brandDescription: jobData.brandDescription,
            targetAudience: jobData.targetAudience,
            brandPersonality: jobData.brandPersonality,
            colorPaletteSuggestion: jobData.colorPaletteSuggestion,
            productTypeDescription: jobData.productTypeDescription,
            creationOptions: {
                ...jobData.creationOptions,
                numberOfProducts: jobData.creationOptions.numberOfProducts ?? 3,
                numberOfBlogPosts: jobData.creationOptions.numberOfBlogPosts ?? 2,
            },
        };
        const generatedContent = await generateShopifyStoreContent(aiInput, jobData.entity.id);
        
        await updateJobStatus(jobId, 'populating', 'Contenido generado. Creando páginas...');
        
        const createdPages: { [key: string]: any } = {};

        // --- 2. Create Pages ---
        if (generatedContent.aboutPage && jobData.creationOptions.createAboutPage) {
            const { data } = await shopifyApi.post('/pages.json', { page: { title: generatedContent.aboutPage.title, body_html: generatedContent.aboutPage.htmlContent } });
            createdPages['about'] = data.page;
        }
        if (generatedContent.contactPage && jobData.creationOptions.createContactPage) {
            const { data } = await shopifyApi.post('/pages.json', { page: { title: generatedContent.contactPage.title, body_html: generatedContent.contactPage.htmlContent } });
            createdPages['contact'] = data.page;
        }
        if (generatedContent.legalPages && jobData.creationOptions.createLegalPages) {
            for (const page of generatedContent.legalPages) {
                // Replace placeholders in legal text
                const legalBusinessName = jobData.legalInfo?.legalBusinessName || jobData.storeName;
                const businessAddress = jobData.legalInfo?.businessAddress || 'Dirección no proporcionada';
                const contactEmail = jobData.businessEmail || 'Email no proporcionado';
                let content = page.htmlContent.replace(/\[Nombre del Negocio\]/gi, legalBusinessName);
                content = content.replace(/\[Dirección\]/gi, businessAddress);
                content = content.replace(/\[Email de Contacto\]/gi, contactEmail);
                
                const { data } = await shopifyApi.post('/pages.json', { page: { title: page.title, body_html: content } });
                createdPages[page.title.toLowerCase().replace(/ /g, '_')] = data.page;
            }
        }
        
        // --- 3. Create Products ---
        if (generatedContent.exampleProducts && jobData.creationOptions.createExampleProducts) {
             await updateJobStatus(jobId, 'populating', 'Páginas creadas. Creando productos...');
             for (const product of generatedContent.exampleProducts) {
                 await shopifyApi.post('/products.json', { product: { title: product.title, body_html: product.descriptionHtml, tags: product.tags.join(',') } });
             }
        }
        
        // --- 4. Create Blog Posts ---
        if (generatedContent.blogPosts && jobData.creationOptions.createBlogWithPosts) {
            await updateJobStatus(jobId, 'populating', 'Productos creados. Creando entradas de blog...');
            const { data: blogs } = await shopifyApi.get('/blogs.json');
            let blogId = blogs.blogs[0]?.id;
            if (!blogId) {
                const { data: newBlog } = await shopifyApi.post('/blogs.json', { blog: { title: 'Noticias' } });
                blogId = newBlog.blog.id;
            }
            for (const post of generatedContent.blogPosts) {
                await shopifyApi.post(`/blogs/${blogId}/articles.json`, { article: { title: post.title, body_html: post.contentHtml, tags: post.tags.join(',') } });
            }
        }
        
        // --- 5. Setup Navigation ---
        if (jobData.creationOptions.setupBasicNav) {
            await updateJobStatus(jobId, 'populating', 'Contenido creado. Configurando menú de navegación...');
            const { data: navs } = await shopifyApi.get('/navigation.json');
            const mainMenu = navs.navigation.find((n: any) => n.handle === 'main-menu');
            if (mainMenu) {
                const links = [];
                if(createdPages['about']) links.push({ title: createdPages['about'].title, url: `/pages/${createdPages['about'].handle}`});
                if(createdPages['contact']) links.push({ title: createdPages['contact'].title, url: `/pages/${createdPages['contact'].handle}`});
                await shopifyApi.put(`/navigation/${mainMenu.id}.json`, { navigation: { ...mainMenu, links }});
            }
        }

        await updateJobStatus(jobId, 'completed', '¡Tienda poblada con éxito!', {});

        // --- 6. Send Final Webhook ---
        if (jobData.webhookUrl) {
             const webhookPayload = {
                jobId: jobId,
                status: 'completed',
                message: 'Tienda creada y poblada con éxito.',
                storeName: jobData.storeName,
                storeUrl: `https://${jobData.storeDomain}`,
                adminUrl: `https://${jobData.storeDomain}/admin`,
            };
            await axios.post(jobData.webhookUrl, webhookPayload, { timeout: 10000 }).catch(e => console.warn(`[Job ${jobId}] Failed to send FINAL COMPLETION webhook to ${jobData.webhookUrl}: ${e.message}`));
        }

    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to populate Shopify store:`, error.response?.data || error.message);
        const errorMessage = error.response?.data?.error_description || error.message || "Un error desconocido ocurrió durante el poblado de la tienda.";
        await updateJobStatus(jobId, 'error', `Error en poblado de contenido: ${errorMessage}`);
         if (jobData! && jobData.webhookUrl) {
             const webhookPayload = { jobId: jobId, status: 'error', message: `Error en poblado de contenido: ${errorMessage}`, storeName: jobData.storeName };
             await axios.post(jobData.webhookUrl, webhookPayload, { timeout: 10000 }).catch(e => console.warn(`[Job ${jobId}] Failed to send POPULATE ERROR webhook to ${jobData.webhookUrl}: ${e.message}`));
        }
    }
}
