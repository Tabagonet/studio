
'use server';
/**
 * @fileOverview Service for text generation using Transformers.js models (e.g., MiniLM, DistilGPT2, T5).
 * This service is responsible for generating various product content fields using local AI models.
 * Prompts are loaded from Firestore and fall back to defaults if not found.
 */
import type { Pipeline } from '@xenova/transformers';
import type { MiniLMInput, GeneratedProductContent, ProductAttribute, AiPrompt, AiPromptKey } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { AI_PROMPTS_COLLECTION } from '@/lib/constants';

let textGenerationPipeline: Pipeline | null = null;
let text2textPipeline: Pipeline | null = null;

const MODEL_TEXT_GENERATION_DEFAULT = 'Xenova/distilgpt2';
const MODEL_TEXT2TEXT_DEFAULT = 'Xenova/t5-small';

// Cache for prompts loaded from Firestore
let configuredPrompts: Map<AiPromptKey, AiPrompt> = new Map();
let promptsLoaded = false;

// Default prompts (fallbacks)
export const DEFAULT_PROMPTS: Record<AiPromptKey, Omit<AiPrompt, 'id' | 'createdAt' | 'updatedAt'>> = {
  seoFilenameBase: {
    promptKey: 'seoFilenameBase',
    description: 'Genera un nombre de archivo base SEO (slug) para un producto.',
    modelType: 'text2text-generation',
    modelName: MODEL_TEXT2TEXT_DEFAULT,
    promptTemplate: `Create a concise, SEO-friendly filename slug (lowercase, hyphens, max 4-5 words) for a product named "{{productName}}" with visual features like "{{visualTagsString}}". Example: for "Agave Titanota Blue", result: "agave-titanota-blue-succulent". Slug:`,
    defaultGenerationParams: { max_new_tokens: 20, num_beams: 2 }
  },
  shortDescription: {
    promptKey: 'shortDescription',
    description: 'Genera una descripción corta y cautivadora para un producto ornamental.',
    modelType: 'text-generation',
    modelName: MODEL_TEXT_GENERATION_DEFAULT,
    promptTemplate: `Write a captivating and concise e-commerce short description (1-2 sentences, around 150 characters) for an ornamental plant named "{{productName}}". 
It is in the category "{{categoryString}}". 
Key visual characteristics are: {{visualTagsString}}. 
Relevant keywords include: {{existingKeywordsString}}. 
Highlight its main appeal for a plant enthusiast. Short Description:`,
    defaultGenerationParams: { max_new_tokens: 70, temperature: 0.7, num_return_sequences: 1, do_sample: true }
  },
  longDescription: {
    promptKey: 'longDescription',
    description: 'Genera una descripción larga y detallada para un producto ornamental.',
    modelType: 'text-generation',
    modelName: MODEL_TEXT_GENERATION_DEFAULT,
    promptTemplate: `Create a detailed and engaging e-commerce long description (2-3 paragraphs) for the ornamental plant "{{productName}}".
Category: {{categoryString}}.
Visual Features: {{visualTagsString}}.
Keywords: {{existingKeywordsString}}.
{{#if attributesString}}Known Attributes: {{attributesString}}.{{/if}}
Describe its origins (if commonly known for this type), care tips (e.g., light, water, soil), and how it can enhance a living space or garden. Maintain an enthusiastic and knowledgeable tone. Long Description:`,
    defaultGenerationParams: { max_new_tokens: 300, temperature: 0.75, do_sample: true }
  },
  seoAltText: {
    promptKey: 'seoAltText',
    description: 'Genera un texto alternativo SEO conciso y descriptivo para una imagen de producto.',
    modelType: 'text2text-generation',
    modelName: MODEL_TEXT2TEXT_DEFAULT,
    promptTemplate: `Generate a concise and descriptive SEO alt text (max 120 characters) for an image of the plant "{{productName}}". Key visual features: "{{visualTagsString}}". Category: "{{categoryString}}". Alt text:`,
    defaultGenerationParams: { max_new_tokens: 30 }
  },
  seoTitle: {
    promptKey: 'seoTitle',
    description: 'Genera un título SEO atractivo (máx. 60 caracteres) para la página de un producto.',
    modelType: 'text2text-generation',
    modelName: MODEL_TEXT2TEXT_DEFAULT,
    promptTemplate: `Create a compelling SEO title (max 60 characters) for the product page of "{{productName}}". Category: "{{categoryString}}". Keywords: "{{existingKeywordsString}}". Title:`,
    defaultGenerationParams: { max_new_tokens: 20 }
  },
  metaDescription: {
    promptKey: 'metaDescription',
    description: 'Genera una meta descripción SEO (máx. 160 caracteres), usualmente un resumen de la descripción corta.',
    modelType: 'text2text-generation', // T5 is good for summarization
    modelName: MODEL_TEXT2TEXT_DEFAULT,
    promptTemplate: `Summarize the following product description into a compelling meta description of around 150-160 characters: "{{shortDescriptionInput}}" Meta Description:`,
    defaultGenerationParams: { max_new_tokens: 60 }
  },
  // Placeholders for more complex AI-driven attribute/tag suggestions if desired in future
  suggestAttributes: {
    promptKey: 'suggestAttributes',
    description: 'Placeholder: Sugiere atributos adicionales basados en la información del producto.',
    modelType: 'text-generation',
    modelName: MODEL_TEXT_GENERATION_DEFAULT,
    promptTemplate: `Based on the product "{{productName}}", category "{{categoryString}}", and visual tags "{{visualTagsString}}", suggest relevant e-commerce attributes. Attributes:`,
    defaultGenerationParams: { max_new_tokens: 50 }
  },
  suggestTags: {
    promptKey: 'suggestTags',
    description: 'Placeholder: Sugiere etiquetas SEO adicionales para el producto.',
    modelType: 'text-generation',
    modelName: MODEL_TEXT_GENERATION_DEFAULT,
    promptTemplate: `Suggest 5-7 SEO-friendly tags for an e-commerce product named "{{productName}}" in category "{{categoryString}}" with visual features "{{visualTagsString}}" and keywords "{{existingKeywordsString}}". Tags (comma-separated):`,
    defaultGenerationParams: { max_new_tokens: 40 }
  }
};

async function loadPromptsFromFirestore() {
  if (!adminDb) {
    console.warn('[MiniLM Service] Firestore adminDb not initialized. Using default prompts.');
    promptsLoaded = true; // Mark as "loaded" to prevent re-attempts with defaults
    return;
  }
  if (promptsLoaded) return;

  try {
    console.log('[MiniLM Service] Loading prompts from Firestore collection:', AI_PROMPTS_COLLECTION);
    const snapshot = await adminDb.collection(AI_PROMPTS_COLLECTION).get();
    if (snapshot.empty) {
      console.warn(`[MiniLM Service] No prompts found in Firestore collection '${AI_PROMPTS_COLLECTION}'. Using default prompts.`);
      // Optionally, seed Firestore with defaults here if it's the first run
      // await seedDefaultPrompts();
    } else {
      snapshot.forEach(doc => {
        const prompt = doc.data() as AiPrompt;
        configuredPrompts.set(prompt.promptKey, prompt);
      });
      console.log(`[MiniLM Service] Loaded ${configuredPrompts.size} prompts from Firestore.`);
    }
  } catch (error) {
    console.error('[MiniLM Service] Error loading prompts from Firestore. Using default prompts:', error);
  } finally {
    promptsLoaded = true;
  }
}

// Helper to get a prompt, falling back to default if not found in Firestore
function getPrompt(key: AiPromptKey): Omit<AiPrompt, 'id' | 'createdAt' | 'updatedAt'> {
  return configuredPrompts.get(key) || DEFAULT_PROMPTS[key];
}

async function getPipeline(task: 'text-generation' | 'text2text-generation', modelNameFromPrompt: string): Promise<Pipeline> {
  const targetModel = modelNameFromPrompt || (task === 'text-generation' ? MODEL_TEXT_GENERATION_DEFAULT : MODEL_TEXT2TEXT_DEFAULT);

  if (task === 'text-generation' && textGenerationPipeline && textGenerationPipeline.model.model_name_or_path === targetModel) return textGenerationPipeline;
  if (task === 'text2text-generation' && text2textPipeline && text2textPipeline.model.model_name_or_path === targetModel) return text2textPipeline;

  console.log(`[Transformers.js] Attempting to load pipeline for task "${task}" with model "${targetModel}"...`);
  const { pipeline } = await import('@xenova/transformers');
  
  const newPipeline = await pipeline(task, targetModel, { /* progress_callback: (progress: any) => console.log(`[Transformers.js ${targetModel}] Loading:`, progress) */ });

  if (task === 'text-generation') textGenerationPipeline = newPipeline;
  else if (task === 'text2text-generation') text2textPipeline = newPipeline;
  
  console.log(`[Transformers.js] Pipeline for task "${task}" with model "${targetModel}" loaded successfully.`);
  return newPipeline;
}

function cleanGeneratedText(text: string, promptContent?: string, maxLength?: number): string {
    let cleaned = text;
    if (promptContent) {
      // Remove the exact prompt string if it's at the beginning
      if (cleaned.startsWith(promptContent)) {
          cleaned = cleaned.substring(promptContent.length);
      }
      // Also try removing just the instructive part of the prompt if it has a clear delimiter
      const promptInstructionEndMarkers = ["Slug:", "Short Description:", "Long Description:", "Alt text:", "Title:", "Meta Description:", "Attributes:", "Tags:"];
      for (const marker of promptInstructionEndMarkers) {
          if (promptContent.includes(marker)) {
              const markerIndex = cleaned.indexOf(marker);
              if (markerIndex !== -1 && markerIndex < promptContent.length) { // Ensure marker is part of original prompt
                  cleaned = cleaned.substring(markerIndex + marker.length);
                  break; 
              }
          }
      }
    }
    
    cleaned = cleaned.replace(/^(Output:|Generated text:|Answer:|Response:)\s*/i, '');
    cleaned = cleaned.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1 && sentences[sentences.length - 1].length < 25 && !/[.!?]$/.test(sentences[sentences.length-1])) {
        cleaned = sentences.slice(0, -1).join(' ').trim();
    }
    if (cleaned.length > 30 && !/[.!?]$/.test(cleaned)) {
        cleaned += '.';
    }
    
    if (maxLength && cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength).trim();
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > 0) cleaned = cleaned.substring(0, lastSpace);
        if (!/[.!?]$/.test(cleaned)) cleaned += '...';
    }
    return cleaned.trim();
}

// Function to replace placeholders like {{productName}} in prompt templates
function interpolatePrompt(promptTemplate: string, data: Record<string, string>): string {
  let result = promptTemplate;
  // Handle {{#if variable}}...{{/if}} blocks
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
      return (data[variableName] && data[variableName].trim() !== '') ? innerContent.trim() : '';
  });

  // Handle simple {{variable}} replacements
  for (const key in data) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), data[key] || '');
  }
  // Remove any unreplaced placeholders (optional, could also throw error)
  // result = result.replace(/\{\{[\w-]+\}\}/g, ''); 
  return result;
}

async function generateWithModel(promptKey: AiPromptKey, inputData: Record<string, string>): Promise<string> {
  await loadPromptsFromFirestore(); // Ensure prompts are loaded
  const promptConfig = getPrompt(promptKey);
  if (!promptConfig) {
    console.error(`[MiniLM Service] Prompt configuration for key "${promptKey}" not found. Cannot generate.`);
    return ""; // Or throw error
  }

  const generator = await getPipeline(promptConfig.modelType, promptConfig.modelName);
  const finalPrompt = interpolatePrompt(promptConfig.promptTemplate, inputData);
  
  console.log(`[MiniLM Service - ${promptKey}] Using Model: ${promptConfig.modelName}, Final Prompt (first 100 chars): ${finalPrompt.substring(0,100)}...`);

  try {
    const result = await generator(finalPrompt, promptConfig.defaultGenerationParams || {});
    if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      // Pass only the part of the prompt *after* the instruction for cleaning.
      const instructionPartEnd = finalPrompt.lastIndexOf(":") + 1;
      const promptContentForCleaning = finalPrompt.substring(instructionPartEnd).trim();
      return cleanGeneratedText(result[0].generated_text, promptContentForCleaning);
    } else if (typeof result === 'string') { // Some pipelines might return string directly
      return cleanGeneratedText(result);
    }
    console.warn(`[MiniLM Service - ${promptKey}] Unexpected result format from model:`, result);
    return "";
  } catch (e) {
    console.error(`[MiniLM Service - ${promptKey}] Error during generation:`, e);
    return "";
  }
}

// --- Specific Generation Functions ---

async function generateSeoFilenameBase(productName: string, visualTags: string[]): Promise<string> {
  const inputData = { 
    productName, 
    visualTagsString: visualTags.slice(0,2).join(', ') 
  };
  const slug = await generateWithModel('seoFilenameBase', inputData);
  return slug.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0,5).join('-') || cleanTextForFilenameHelper(productName);
}

function cleanTextForFilenameHelper(text: string): string {
  if (!text) return `imagen-desconocida-${Date.now().toString().slice(-5)}`;
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

async function generateShortDescription(input: MiniLMInput): Promise<string> {
  const inputData = {
    productName: input.productName,
    categoryString: input.category || 'plants',
    visualTagsString: input.visualTags.join(', ') || 'unique beauty',
    existingKeywordsString: input.existingKeywords || 'decorative, easy-care'
  };
  const desc = await generateWithModel('shortDescription', inputData);
  return desc || `Discover the stunning ${input.productName}, a perfect ${input.category || 'addition'} for your collection.`;
}

async function generateLongDescription(input: MiniLMInput): Promise<string> {
  const attributesString = (input.existingAttributes || []).map(a => `${a.name}: ${a.value}`).join(', ');
  const inputData = {
    productName: input.productName,
    categoryString: input.category || 'Decorative Plants',
    visualTagsString: input.visualTags.join(', ') || 'distinctive appearance',
    existingKeywordsString: input.existingKeywords || 'houseplant, garden, collector item',
    attributesString: attributesString
  };
  const desc = await generateWithModel('longDescription', inputData);
  return desc || `Explore the exquisite ${input.productName}, a prized ${input.category || 'plant'} celebrated for its beauty.`;
}

async function generateSeoAltText(productName: string, visualTags: string[], category?: string): Promise<string> {
  const inputData = {
    productName,
    visualTagsString: visualTags.join(', '),
    categoryString: category || 'plant'
  };
  const alt = await generateWithModel('seoAltText', inputData);
  return alt || `${productName} - ${category || ''} - ${visualTags.join(' ')}`.substring(0,125).trim();
}

async function generateSeoTitle(productName: string, category?: string, keywords?: string): Promise<string> {
  const inputData = {
    productName,
    categoryString: category || 'Plant',
    existingKeywordsString: keywords || productName
  };
  const title = await generateWithModel('seoTitle', inputData);
  return title || `${productName} | ${category || 'Premium Plant'}`.substring(0, 60);
}

async function generateMetaDescription(shortDescriptionInput: string, productName: string): Promise<string> {
    if (!shortDescriptionInput && productName) {
        shortDescriptionInput = `High-quality ${productName}, perfect for your collection. Discover more about its unique features and care.`;
    } else if (!shortDescriptionInput && !productName) {
        shortDescriptionInput = "Discover our unique collection of ornamental plants and accessories. High-quality items for enthusiasts.";
    }
    const inputData = { shortDescriptionInput: shortDescriptionInput.substring(0, 500) }; // Limit input length for safety
    const metaDesc = await generateWithModel('metaDescription', inputData);
    return metaDesc.substring(0, 160) || shortDescriptionInput.substring(0, 160);
}


// --- Main Exported Function ---
export async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  console.log('[MiniLM Service] Received input for REAL content generation:', JSON.stringify(input, null, 2));
  await loadPromptsFromFirestore(); // Ensure prompts are loaded/attempted

  const { productName, visualTags, category, existingKeywords, existingAttributes } = input;

  const seoFilenameBase = await generateSeoFilenameBase(productName, visualTags);
  console.log(`[MiniLM Service] Generated SEO Filename Base: ${seoFilenameBase}`);

  const shortDescription = await generateShortDescription(input);
  console.log(`[MiniLM Service] Generated Short Description: ${shortDescription.substring(0,100)}...`);
  
  const longDescription = await generateLongDescription(input);
  console.log(`[MiniLM Service] Generated Long Description: ${longDescription.substring(0,100)}...`);

  const altText = await generateSeoAltText(productName, visualTags, category);
  const seoTitle = await generateSeoTitle(productName, category, existingKeywords);
  const metaDescription = await generateMetaDescription(shortDescription, productName);
  console.log(`[MiniLM Service] Generated SEO: Alt="${altText}", Title="${seoTitle}", MetaDesc="${metaDescription}"`);

  // Attributes: For now, pass existing or add very basic ones. AI generation for structured attributes is complex.
  const attributes: ProductAttribute[] = [...(existingAttributes || [])];
  if (!attributes.find(a => a.name.toLowerCase() === 'type' || a.name.toLowerCase() === 'tipo')) {
      if (category) attributes.push({ name: 'Tipo de Planta', value: category });
      else if (visualTags.some(vt => vt.toLowerCase().includes('succulent'))) attributes.push({ name: 'Tipo', value: 'Suculenta' });
  }
  (visualTags || []).forEach(tag => {
    if (tag && !attributes.find(a => a.name.toLowerCase() === 'visual feature' && a.value.toLowerCase().includes(tag.toLowerCase()))) {
      attributes.push({ name: 'Característica Visual', value: tag });
    }
  });
  if (attributes.length === 0 && productName.toLowerCase().includes('agave')) {
    attributes.push({name: "Género", value: "Agave"});
  } else if (attributes.length === 0) {
    attributes.push({name: "Origen", value: "Vivero Especializado"});
  }
  console.log(`[MiniLM Service] Final Attributes:`, attributes);

  const tagsSet = new Set<string>((existingKeywords || '').split(',').map(k => k.trim()).filter(k => k));
  (visualTags || []).forEach(tag => tagsSet.add(tag.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''))); 
  if (category) tagsSet.add(category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  tagsSet.add(productName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  const tags = Array.from(tagsSet).slice(0, 10); 
  console.log(`[MiniLM Service] Final Tags:`, tags);

  return {
    seoFilenameBase,
    shortDescription,
    longDescription,
    seoMetadata: {
      alt: altText,
      title: seoTitle,
      description: metaDescription,
    },
    attributes,
    tags,
  };
}

// Function to seed Firestore with default prompts if they don't exist
// Call this manually or on first app start if desired.
// async function seedDefaultPrompts() {
//   if (!adminDb) return;
//   console.log('[MiniLM Service] Seeding default prompts to Firestore...');
//   const batch = adminDb.batch();
//   let count = 0;
//   for (const key in DEFAULT_PROMPTS) {
//     const promptKey = key as AiPromptKey;
//     const promptData = DEFAULT_PROMPTS[promptKey];
//     const docRef = adminDb.collection(AI_PROMPTS_COLLECTION).doc(promptKey); // Use promptKey as doc ID for easy lookup
    
//     // Check if document already exists
//     const docSnap = await docRef.get();
//     if (!docSnap.exists) {
//         batch.set(docRef, { 
//             ...promptData, 
//             createdAt: admin.firestore.FieldValue.serverTimestamp(), 
//             updatedAt: admin.firestore.FieldValue.serverTimestamp() 
//         });
//         count++;
//     }
//   }
//   if (count > 0) {
//     await batch.commit();
//     console.log(`[MiniLM Service] Seeded ${count} default prompts to Firestore.`);
//   } else {
//     console.log('[MiniLM Service] All default prompts already exist in Firestore. No seeding needed.');
//   }
// }
// Call seedDefaultPrompts() once if you want to populate Firestore on first run.
// Be careful not to call it on every server start unless you want to overwrite changes made via UI.
// A better approach would be a separate script or a check on app init.

