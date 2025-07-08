
'use server';
/**
 * @fileOverview AI content generation for Shopify stores using Genkit.
 */
import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { adminDb, admin } from '@/lib/firebase-admin';

// --- Input Schema (derived from the job data) ---
const GenerationInputSchema = z.object({
  storeName: z.string(),
  brandDescription: z.string(),
  targetAudience: z.string(),
  brandPersonality: z.string(),
  colorPaletteSuggestion: z.string().optional(),
  productTypeDescription: z.string(),
  creationOptions: z.object({
    createExampleProducts: z.boolean(),
    numberOfProducts: z.number().optional().default(3),
    createAboutPage: z.boolean(),
    createContactPage: z.boolean(),
    createLegalPages: z.boolean(),
    createBlogWithPosts: z.boolean(),
    numberOfBlogPosts: z.number().optional().default(2),
  }),
});
export type GenerationInput = z.infer<typeof GenerationInputSchema>;

// --- Output Schema (what the AI should generate) ---
export const GeneratedContentSchema = z.object({
    aboutPage: z.object({
        title: z.string(),
        htmlContent: z.string(),
    }).optional(),
    contactPage: z.object({
        title: z.string(),
        htmlContent: z.string(),
    }).optional(),
    legalPages: z.array(z.object({
        title: z.string(),
        htmlContent: z.string(),
    })).optional().describe("An array containing objects for Privacy Policy, Terms of Service, etc."),
    exampleProducts: z.array(z.object({
        title: z.string(),
        descriptionHtml: z.string(),
        tags: z.array(z.string()),
        imagePrompt: z.string().describe("A DALL-E or Midjourney prompt to generate a product photo."),
    })).optional(),
    blogPosts: z.array(z.object({
        title: z.string(),
        contentHtml: z.string(),
        tags: z.array(z.string()),
    })).optional(),
});
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;

const SHOPIFY_CONTENT_PROMPT_TEMPLATE = `
You are a world-class e-commerce expert, copywriter, and brand strategist. Your task is to generate the initial content for a brand-new Shopify store based on the user's input.
You MUST generate a single, valid JSON object containing the requested content. Do not add any markdown formatting or comments around the JSON.

**STORE CONTEXT:**
- **Store Name:** {{storeName}}
- **Brand Description:** {{brandDescription}}
- **Target Audience:** {{targetAudience}}
- **Brand Personality:** {{brandPersonality}}
- **Product Type:** {{productTypeDescription}}
- **Color Palette Suggestion:** {{colorPaletteSuggestion}}

**INSTRUCTIONS:**
Based on the context, generate a JSON object with the following keys. Only include a key if the corresponding option is true in the 'creationOptions' section below. Use simple HTML tags (e.g., <h1>, <h2>, <p>, <strong>, <ul>, <li>) for formatting where appropriate.

{{#if creationOptions.createAboutPage}}
1.  **"aboutPage" (object):**
    -   "title": A title for the "About Us" page.
    -   "htmlContent": A compelling story about the brand.
{{/if}}

{{#if creationOptions.createContactPage}}
2.  **"contactPage" (object):**
    -   "title": A title for the "Contact Us" page.
    -   "htmlContent": A simple contact page body, including placeholders for a contact form and business details.
{{/if}}

{{#if creationOptions.createLegalPages}}
3.  **"legalPages" (array of objects):**
    -   Generate standard legal pages (Privacy Policy, Terms of Service).
    -   Use placeholders like \`[Nombre del Negocio]\`, \`[Email de Contacto]\`, \`[Dirección]\` where appropriate.
    -   "title": The title of the legal page (e.g., "Política de Privacidad").
    -   "htmlContent": The full HTML content of the page.
{{/if}}

{{#if creationOptions.createExampleProducts}}
4.  **"exampleProducts" (array of objects):**
    -   Generate {{creationOptions.numberOfProducts}} distinct product examples.
    -   "title": A catchy, SEO-friendly product name.
    -   "descriptionHtml": A detailed and persuasive product description using HTML.
    -   "tags": An array of 3-5 relevant string tags for the product.
    -   "imagePrompt": A detailed text-to-image prompt (like for DALL-E or Midjourney) that could be used to generate a high-quality, professional photo for this product.
{{/if}}

{{#if creationOptions.createBlogWithPosts}}
5.  **"blogPosts" (array of objects):**
    -   Generate {{creationOptions.numberOfBlogPosts}} distinct blog post examples.
    -   "title": An engaging, SEO-friendly blog post title.
    -   "contentHtml": A short but well-structured blog post (2-3 paragraphs) with headings.
    -   "tags": An array of 2-3 relevant string tags for the blog post.
{{/if}}

Now, generate the JSON content based on these instructions.
`;

// In a real app, this prompt would come from Firestore, but for now, we use the template.
const shopifyContentPrompt = ai.definePrompt({
    name: 'shopifyContentPrompt',
    input: { schema: GenerationInputSchema },
    output: { schema: GeneratedContentSchema },
    prompt: SHOPIFY_CONTENT_PROMPT_TEMPLATE
});


const generateShopifyContentFlow = ai.defineFlow(
    {
        name: 'generateShopifyContentFlow',
        inputSchema: GenerationInputSchema,
        outputSchema: GeneratedContentSchema,
    },
    async (input) => {
        const { output } = await shopifyContentPrompt(input);
        return output!;
    }
);


export async function generateShopifyStoreContent(input: GenerationInput, uid: string): Promise<GeneratedContent> {
  const generatedContent = await generateShopifyContentFlow(input);

  // Increment AI usage count
  if (adminDb && uid) {
      const userSettingsRef = adminDb.collection('user_settings').doc(uid);
      await userSettingsRef.set({ aiUsageCount: admin.firestore.FieldValue.increment(1) }, { merge: true });
  }

  return generatedContent;
}
