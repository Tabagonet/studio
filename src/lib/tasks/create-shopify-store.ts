
'use server';

import { admin, adminDb } from '@/lib/firebase-admin';
import axios from 'axios';
import { generateShopifyStoreContent, type GeneratedContent, type GenerationInput } from '@/ai/flows/shopify-content-flow';
import { createShopifyApi } from '@/lib/shopify';
import type { AxiosInstance } from 'axios';
import { getPartnerCredentials } from '@/lib/api-helpers';

async function updateJobStatus(jobId: string, status: 'processing' | 'completed' | 'error', logMessage: string, extraData: Record<string, any> = {}) {
    if (!adminDb) return;
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
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

export async function handleCreateShopifyStore(jobId: string) {
    if (!adminDb) {
        console.error("Firestore not available in handleCreateShopifyStore.");
        return;
    }

    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        await updateJobStatus(jobId, 'processing', 'Obteniendo credenciales y ajustes de la entidad...');
        
        let settingsSource;
        if (jobData.entity.type === 'company') {
            const companyDoc = await adminDb.collection('companies').doc(jobData.entity.id).get();
            if (!companyDoc.exists) throw new Error(`Company ${jobData.entity.id} not found.`);
            settingsSource = companyDoc.data();
        } else {
            const userSettingsDoc = await adminDb.collection('user_settings').doc(jobData.entity.id).get();
            settingsSource = userSettingsDoc.data();
        }

        // Override product creation based on company/user setting
        if (settingsSource?.shopifyCreationDefaults?.createProducts === false) {
            if (jobData.creationOptions.createExampleProducts === true) {
                await updateJobStatus(jobId, 'processing', 'La creación de productos ha sido desactivada por un ajuste de la entidad.');
            }
            jobData.creationOptions.createExampleProducts = false;
        }

        // Get the default theme from settings if available
        const defaultTheme = settingsSource?.shopifyCreationDefaults?.theme;
        if (defaultTheme) {
             jobData.creationOptions.theme = defaultTheme;
        }

        const { clientId: partnerClientId, accessToken: partnerAccessToken } = await getPartnerCredentials(jobId);

        const graphqlEndpoint = `https://partners.shopify.com/api/2024-07/graphql.json`;

        await updateJobStatus(jobId, 'processing', `Creando tienda de desarrollo para "${jobData.storeName}"...`);
        
        const mutation = `
            mutation DevelopmentStoreCreate($input: DevelopmentStoreCreateInput!) {
              developmentStoreCreate(input: $input) {
                store {
                  shopId
                  shopName
                  storeUrl
                  adminUrl
                }
                userErrors {
                  field
                  message
                }
              }
            }
        `;
        
        const variables: any = {
            input: {
                name: jobData.storeName,
                businessEmail: jobData.businessEmail,
                countryCode: jobData.countryCode,
                appId: partnerClientId,
            }
        };

        // Add theme template if specified in the job
        if (jobData.creationOptions?.theme) {
            variables.input.template = jobData.creationOptions.theme;
             await updateJobStatus(jobId, 'processing', `Usando la plantilla de tema: "${jobData.creationOptions.theme}".`);
        }

        const response = await axios.post(
            graphqlEndpoint,
            { query: mutation, variables },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': partnerAccessToken,
                },
            }
        );
        
        const responseData = response.data;
        if (responseData.errors) {
            throw new Error(`Error de GraphQL: ${JSON.stringify(responseData.errors)}`);
        }

        const userErrors = responseData.data?.developmentStoreCreate?.userErrors;
        if (userErrors && userErrors.length > 0) {
            const errorMessages = userErrors.map((e: any) => `${e.field.join('.')}: ${e.message}`).join(', ');
            throw new Error(`Shopify devolvió errores: ${errorMessages}`);
        }

        const createdStore = responseData.data?.developmentStoreCreate?.store;
        if (!createdStore) {
            throw new Error('La API de Shopify no devolvió los datos de la tienda creada.');
        }
        
        await updateJobStatus(jobId, 'processing', `Tienda base creada en: ${createdStore.storeUrl}. Esperando autorización de la app...`, {
            createdStoreUrl: createdStore.storeUrl,
            createdStoreAdminUrl: createdStore.adminUrl,
        });
        
    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to create Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error fatal: ${error.message}`);
    }
}


export async function populateShopifyStore(jobId: string) {
     if (!adminDb) {
        console.error("Firestore not available in populateShopifyStore.");
        return;
    }
    const jobRef = adminDb.collection('shopify_creation_jobs').doc(jobId);
    let createdPages: { title: string; handle: string; }[] = [];

    try {
        const jobDoc = await jobRef.get();
        if (!jobDoc.exists) throw new Error(`Job ${jobId} not found.`);
        const jobData = jobDoc.data()!;

        if (!jobData.storeAccessToken || !jobData.createdStoreUrl) {
            throw new Error("El trabajo no tiene un token de acceso o URL de tienda. No se puede poblar.");
        }

        const entityUid = jobData.entity.type === 'user' ? jobData.entity.id : '';

        await updateJobStatus(jobId, 'processing', 'Generando contenido con IA...');
        
        const generationInput: GenerationInput = {
            storeName: jobData.storeName,
            brandDescription: jobData.brandDescription,
            targetAudience: jobData.targetAudience,
            brandPersonality: jobData.brandPersonality,
            colorPaletteSuggestion: jobData.colorPaletteSuggestion,
            productTypeDescription: jobData.productTypeDescription,
            creationOptions: jobData.creationOptions,
        };

        const generatedContent = await generateShopifyStoreContent(generationInput, entityUid);
        await updateJobStatus(jobId, 'processing', 'Contenido generado. Guardando resultados y preparando para poblar la tienda...', {
            generatedContent: generatedContent,
        });

        const shopifyApi = createShopifyApi({ url: jobData.createdStoreUrl, accessToken: jobData.storeAccessToken });
        if (!shopifyApi) throw new Error("No se pudo inicializar el cliente de la API de Shopify para la nueva tienda.");
        await updateJobStatus(jobId, 'processing', 'Cliente de API de tienda creado. Iniciando población de contenido...');

        // Create pages
        if (jobData.creationOptions.createAboutPage && generatedContent.aboutPage) {
            const page = await createShopifyPage(jobId, shopifyApi, generatedContent.aboutPage);
            if (page) createdPages.push(page);
        }
        if (jobData.creationOptions.createContactPage && generatedContent.contactPage) {
             const page = await createShopifyPage(jobId, shopifyApi, generatedContent.contactPage);
             if (page) createdPages.push(page);
        }
        if (jobData.creationOptions.createLegalPages && generatedContent.legalPages) {
            for (const pageData of generatedContent.legalPages) {
                 const page = await createShopifyPage(jobId, shopifyApi, pageData);
                 if (page) createdPages.push(page);
            }
        }
        
        // Create products
        if (jobData.creationOptions.createExampleProducts && generatedContent.exampleProducts) {
            for (const product of generatedContent.exampleProducts) {
                await createShopifyProduct(jobId, shopifyApi, product);
            }
        }
        
        // Create blog posts
        if (jobData.creationOptions.createBlogWithPosts && generatedContent.blogPosts) {
            const blog = await findOrCreateBlog(jobId, shopifyApi, "Noticias");
            if (blog) {
                for (const post of generatedContent.blogPosts) {
                    await createShopifyBlogPost(jobId, shopifyApi, blog.id, post);
                }
            }
        }
        
        // Setup navigation
        if (jobData.creationOptions.setupBasicNav) {
            await setupBasicNavigation(jobId, shopifyApi, createdPages);
        }

        
        await updateJobStatus(jobId, 'completed', '¡Proceso finalizado! La tienda ha sido creada y poblada con contenido inicial.');

    } catch (error: any) {
        console.error(`[Job ${jobId}] Failed to populate Shopify store:`, error.message);
        await updateJobStatus(jobId, 'error', `Error al poblar la tienda: ${error.message}`);
    }
}

async function createShopifyPage(jobId: string, api: AxiosInstance, pageData: { title: string, htmlContent: string }): Promise<{ title: string; handle: string; } | null> {
    try {
        await updateJobStatus(jobId, 'processing', `Creando página: "${pageData.title}"...`);
        const response = await api.post('pages.json', {
            page: {
                title: pageData.title,
                body_html: pageData.htmlContent,
            }
        });
        return { title: response.data.page.title, handle: response.data.page.handle };
    } catch (error: any) {
        const errorMessage = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message;
        await updateJobStatus(jobId, 'processing', `Error al crear la página "${pageData.title}": ${errorMessage}`);
        return null;
    }
}

async function createShopifyProduct(jobId: string, api: AxiosInstance, productData: { title: string; descriptionHtml: string; tags: string[]; imagePrompt: string; }) {
    try {
        await updateJobStatus(jobId, 'processing', `Creando producto: "${productData.title}"...`);
        
        const payload: any = {
            product: {
                title: productData.title,
                body_html: productData.descriptionHtml,
                tags: productData.tags.join(','),
                status: 'active',
            }
        };

        // Add a placeholder image if an image prompt was generated
        if (productData.imagePrompt) {
            payload.product.images = [{
                src: 'https://placehold.co/600x600.png',
                alt: productData.imagePrompt, // Using the prompt as alt text is good for SEO
            }];
        }

        const response = await api.post('products.json', payload);
        const createdProduct = response.data.product;

        let logMessage = `Producto "${productData.title}" creado (ID: ${createdProduct.id}).`;
        if (payload.product.images) {
            logMessage += ' Se ha añadido una imagen de marcador de posición.';
        }
        
        await updateJobStatus(jobId, 'processing', logMessage);
        
    } catch (error: any) {
        const errorMessage = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message;
        await updateJobStatus(jobId, 'processing', `Error al crear el producto "${productData.title}": ${errorMessage}`);
    }
}

async function findOrCreateBlog(jobId: string, api: AxiosInstance, blogTitle: string): Promise<{ id: number } | null> {
    try {
        await updateJobStatus(jobId, 'processing', 'Verificando o creando blog...');
        const { data } = await api.get('blogs.json');
        let blog = data.blogs.find((b: any) => b.title === blogTitle);
        if (!blog) {
            const createResponse = await api.post('blogs.json', { blog: { title: blogTitle } });
            blog = createResponse.data.blog;
        }
        return blog;
    } catch (error: any) {
         const errorMessage = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message;
        await updateJobStatus(jobId, 'processing', `Error al buscar o crear el blog: ${errorMessage}`);
        return null;
    }
}

async function createShopifyBlogPost(jobId: string, api: AxiosInstance, blogId: number, postData: { title: string; contentHtml: string; tags: string[] }) {
     try {
        await updateJobStatus(jobId, 'processing', `Creando post del blog: "${postData.title}"...`);
        await api.post(`blogs/${blogId}/articles.json`, {
            article: {
                title: postData.title,
                author: 'Admin',
                body_html: postData.contentHtml,
                tags: postData.tags.join(','),
            }
        });
    } catch (error: any) {
        const errorMessage = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message;
        await updateJobStatus(jobId, 'processing', `Error al crear el post "${postData.title}": ${errorMessage}`);
    }
}


async function setupBasicNavigation(jobId: string, api: AxiosInstance, createdPages: { title: string; handle: string }[]) {
    try {
        await updateJobStatus(jobId, 'processing', 'Configurando menú de navegación...');
        const { data: navData } = await api.get('navigation.json');
        
        let mainMenu = navData.navigation.find((nav: any) => nav.handle === 'main-menu');
        
        if (!mainMenu) {
            const createNavResponse = await api.post('navigation.json', {
                navigation: { title: 'Main Menu', handle: 'main-menu' }
            });
            mainMenu = createNavResponse.data.navigation;
            await updateJobStatus(jobId, 'processing', 'Menú principal no encontrado, creando uno nuevo.');
        }

        const linksToAdd: { title: string; url: string }[] = [
            { title: 'Inicio', url: '/' },
        ];
        
        const aboutPage = createdPages.find(p => p.title.toLowerCase().includes('sobre nosotros'));
        if (aboutPage) linksToAdd.push({ title: aboutPage.title, url: `/pages/${aboutPage.handle}` });

        const contactPage = createdPages.find(p => p.title.toLowerCase().includes('contacto'));
        if (contactPage) linksToAdd.push({ title: contactPage.title, url: `/pages/${contactPage.handle}` });
        
        // This creates links sequentially. Could be batched for minor performance gain.
        for (const link of linksToAdd) {
            await api.post(`navigation/${mainMenu.id}/links.json`, {
                link: { title: link.title, url: link.url }
            });
            await updateJobStatus(jobId, 'processing', `Añadido enlace "${link.title}" al menú principal.`);
        }
        
    } catch (error: any) {
        const errorMessage = error.response?.data?.errors ? JSON.stringify(error.response.data.errors) : error.message;
        await updateJobStatus(jobId, 'processing', `Error configurando la navegación: ${errorMessage}`);
    }
}
