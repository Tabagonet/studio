
import { admin, adminDb } from '@/lib/firebase-admin';
import axios, { AxiosInstance } from 'axios';
import { getPartnerCredentials } from '@/lib/api-helpers';
import { createShopifyApi } from '@/lib/shopify';
import { GenerationInput, generateShopifyStoreContent } from '@/ai/flows/shopify-content-flow';
import type { ShopifyCreationJob } from '@/lib/types';
import { exec } from 'child_process';
import util from 'util';
import retry from 'async-retry';


const execPromise = util.promisify(exec);

async function updateJobStatus(jobId: string, status: 'processing' | 'completed' | 'error' | 'awaiting_auth' | 'authorized', logMessage: string, extraData: Record<string, any> = {}) {
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

// This function contains the full logic for creating a development store.
// It's the primary task executed by the Cloud Task queue.
export async function handleCreateShopifyStore(jobId: string) {
    console.log(`[Task Logic] Starting handleCreateShopifyStore for Job ID: ${jobId}`);
    if (!adminDb) {
        console.error("[Task Logic] Firestore not available in handleCreateShopifyStore.");
        throw new Error("Firestore not available.");
    }

    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        await updateJobStatus(jobId, 'processing', 'Tarea iniciada. Obteniendo credenciales globales de Shopify Partner...');
        
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;
        console.log(`[Task Logic - Job ${jobId}] Job data loaded successfully.`);

        console.log(`[Task Logic - Job ${jobId}] Attempting to get partner credentials...`);
        const partnerCreds = await getPartnerCredentials();
        if (!partnerCreds.partnerApiToken || !partnerCreds.organizationId) {
            throw new Error("El token de acceso y el ID de organización de la API de Partner no están configurados en los ajustes globales.");
        }
        console.log(`[Task Logic - Job ${jobId}] Credenciales de Partner obtenidas. Organization ID: ${partnerCreds.organizationId}`);
        
        await updateJobStatus(jobId, 'processing', `Creando tienda de desarrollo para "${jobData.storeName}"...`);
        
        // --- Execute Shopify CLI command ---
        const cliCommand = `shopify app dev store create --name "${jobData.storeName}" --organization-id ${partnerCreds.organizationId} --store-type development`;
        console.log(`[Task Logic - Job ${jobId}] Executing Shopify CLI command: ${cliCommand}`);

        // Set the SHOPIFY_CLI_PARTNERS_TOKEN environment variable for the command
        const env = { ...process.env, SHOPIFY_CLI_PARTNERS_TOKEN: partnerCreds.partnerApiToken };
        
        const { stdout, stderr } = await execPromise(cliCommand, { env });
        
        if (stderr) {
            console.error(`[Task Logic - Job ${jobId}] Shopify CLI stderr: ${stderr}`);
            if (stderr.toLowerCase().includes('error')) {
                throw new Error(`Shopify CLI returned an error: ${stderr}`);
            }
        }
        console.log(`[Task Logic - Job ${jobId}] Shopify CLI stdout: ${stdout}`);

        // --- Parse CLI output to get store domain ---
        const domainMatch = stdout.match(/https?:\/\/([a-zA-Z0-9-]+\.myshopify\.com)/);
        if (!domainMatch || !domainMatch[1]) {
            throw new Error('Could not parse the store domain from the Shopify CLI output.');
        }
        const storeDomain = domainMatch[1];
        console.log(`[Task Logic - Job ${jobId}] Store created successfully: ${storeDomain}`);

        const storeAdminUrl = `https://${storeDomain}/admin`;
        const storeUrl = `https://${storeDomain}`;

        if (!partnerCreds.clientId) {
            throw new Error("El Client ID de la App Personalizada no está configurado en los ajustes globales.");
        }
        console.log(`[Task Logic - Job ${jobId}] Custom App Client ID obtained.`);

        const scopes = 'write_products,write_content,write_themes,read_products,read_content,read_themes,write_navigation,read_navigation';
        const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/shopify/auth/callback`;
        const installUrl = `https://${storeDomain}/admin/oauth/authorize?client_id=${partnerCreds.clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${jobId}`;
        console.log(`[Task Logic - Job ${jobId}] Generated install URL: ${installUrl}`);
        
        await updateJobStatus(jobId, 'awaiting_auth', 'Tienda creada. Esperando autorización del usuario para poblar contenido.', {
            createdStoreUrl: storeUrl,
            createdStoreAdminUrl: storeAdminUrl,
            storefrontPassword: null, 
            installUrl: installUrl,
        });
        
        if (jobData.webhookUrl) {
            const webhookPayload = {
                jobId: jobId,
                status: 'awaiting_auth',
                message: 'Tienda creada, esperando autorización para configurar.',
                storeName: jobData.storeName,
                storeUrl: storeUrl,
                installUrl: installUrl,
                adminUrl: storeAdminUrl
            };
            try {
                await retry(async () => {
                     await axios.post(jobData.webhookUrl, webhookPayload, { timeout: 10000 });
                }, { retries: 2, minTimeout: 1000 });
                console.log(`[Task Logic - Job ${jobId}] Webhook 'awaiting_auth' sent to ${jobData.webhookUrl}`);
            } catch (webhookError: any) {
                console.warn(`[Task Logic - Job ${jobId}] Failed to send awaiting_auth webhook to ${jobData.webhookUrl}: ${webhookError.message}`);
            }
        }

    } catch (error: any) {
        const errorMessage = error.response?.data ? JSON.stringify(error.response.data) : error.message;
        console.error(`[Task Logic - Job ${jobId}] Fatal error in store creation:`, errorMessage);
        await updateJobStatus(jobId, 'error', `Error fatal en la creación: ${errorMessage}`);
        
        const jobDoc = await jobRef.get();
        if (jobDoc.exists && jobDoc.data()?.webhookUrl) {
             const webhookPayload = {
                jobId: jobId,
                status: 'error',
                message: errorMessage,
                storeName: jobDoc.data()!.storeName,
            };
            try {
                 await retry(async () => {
                    await axios.post(jobDoc.data()!.webhookUrl, webhookPayload, { timeout: 10000 });
                 }, { retries: 2, minTimeout: 1000 });
                 console.log(`[Task Logic - Job ${jobId}] ERROR webhook sent to ${jobDoc.data()!.webhookUrl}`);
            } catch (webhookError: any) {
                 console.warn(`[Task Logic - Job ${jobId}] Failed to send ERROR webhook to ${jobDoc.data()!.webhookUrl}: ${webhookError.message}`);
            }
        }
    }
}


/**
 * @description Populates a Shopify store with content after authorization.
 * This function is triggered after the OAuth flow is complete.
 */
export async function populateShopifyStore(jobId: string) {
    if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        throw new Error("Firestore not available.");
    }
    
    await updateJobStatus(jobId, 'processing', 'Autorización recibida. Generando contenido con IA...');
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    let shopifyApi: AxiosInstance | null = null;
    let jobData: ShopifyCreationJob;

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        jobData = jobDoc.data() as ShopifyCreationJob;

        if (!jobData.storeAccessToken || !jobData.createdStoreUrl) {
            throw new Error("El token de acceso o la URL de la tienda no están presentes en el trabajo.");
        }

        shopifyApi = createShopifyApi({ url: jobData.createdStoreUrl, accessToken: jobData.storeAccessToken });
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
        
        await updateJobStatus(jobId, 'processing', 'Contenido generado. Creando páginas...');
        
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
             await updateJobStatus(jobId, 'processing', 'Páginas creadas. Creando productos...');
             for (const product of generatedContent.exampleProducts) {
                 await shopifyApi.post('/products.json', { product: { title: product.title, body_html: product.descriptionHtml, tags: product.tags.join(',') } });
             }
        }
        
        // --- 4. Create Blog Posts ---
        if (generatedContent.blogPosts && jobData.creationOptions.createBlogWithPosts) {
            await updateJobStatus(jobId, 'processing', 'Productos creados. Creando entradas de blog...');
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
            await updateJobStatus(jobId, 'processing', 'Contenido creado. Configurando menú de navegación...');
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
                storeUrl: jobData.createdStoreUrl,
                adminUrl: jobData.createdStoreAdminUrl,
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
