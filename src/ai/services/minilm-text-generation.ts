
'use server';
/**
 * @fileOverview Service for text generation using Transformers.js models (e.g., MiniLM, DistilGPT2, T5).
 * This service is responsible for generating various product content fields using local AI models.
 * Prompts are loaded from Firestore and fall back to defaults if not found.
 */
import type { Pipeline } from '@xenova/transformers';
import type { MiniLMInput, GeneratedProductContent, ProductAttribute, AiPrompt, AiPromptKey } from '@/lib/types';
import { adminDb } from '@/lib/firebase-admin';
import { AI_PROMPTS_COLLECTION, DEFAULT_PROMPTS } from '@/lib/constants'; // Import DEFAULT_PROMPTS from constants

let textGenerationPipeline: Pipeline | null = null;
let text2textPipeline: Pipeline | null = null;

const MODEL_TEXT_GENERATION_DEFAULT = 'Xenova/distilgpt2';
const MODEL_TEXT2TEXT_DEFAULT = 'Xenova/t5-small';

// Cache for prompts loaded from Firestore
let configuredPrompts: Map<AiPromptKey, AiPrompt> = new Map();
let promptsLoaded = false;

async function loadPromptsFromFirestore() {
  if (!adminDb) {
    console.warn('[MiniLM Service] Firestore adminDb not initialized. Using default prompts.');
    promptsLoaded = true; // Mark as "loaded" to prevent re-attempts with defaults
    return;
  }
  if (promptsLoaded && configuredPrompts.size > 0) { // Check if already loaded and has content
    console.log('[MiniLM Service] Prompts already loaded from Firestore or defaults previously applied.');
    return;
  }

  console.log('[MiniLM Service] Attempting to load prompts from Firestore collection:', AI_PROMPTS_COLLECTION);
  try {
    const snapshot = await adminDb.collection(AI_PROMPTS_COLLECTION).get();
    if (snapshot.empty) {
      console.warn(`[MiniLM Service] No prompts found in Firestore collection '${AI_PROMPTS_COLLECTION}'. Using default prompts.`);
      // Populate with defaults if Firestore is empty
      Object.values(DEFAULT_PROMPTS).forEach(prompt => {
        configuredPrompts.set(prompt.promptKey, prompt as AiPrompt); // Cast as AiPrompt for consistency
      });
      console.log('[MiniLM Service] Populated configuredPrompts with default values.');
    } else {
      snapshot.forEach(doc => {
        const prompt = doc.data() as AiPrompt;
        configuredPrompts.set(prompt.promptKey, prompt);
      });
      console.log(`[MiniLM Service] Loaded ${configuredPrompts.size} prompts from Firestore.`);
    }
  } catch (error) {
    console.error('[MiniLM Service] Error loading prompts from Firestore. Using default prompts:', error);
    Object.values(DEFAULT_PROMPTS).forEach(prompt => {
        configuredPrompts.set(prompt.promptKey, prompt as AiPrompt);
    });
    console.log('[MiniLM Service] Populated configuredPrompts with default values due to Firestore error.');
  } finally {
    promptsLoaded = true;
  }
}

// Helper to get a prompt, falling back to default if not found in Firestore
function getPrompt(key: AiPromptKey): Omit<AiPrompt, 'id' | 'createdAt' | 'updatedAt'> {
  const prompt = configuredPrompts.get(key) || DEFAULT_PROMPTS[key];
  if (!prompt) {
    console.error(`[MiniLM Service] CRITICAL: Default prompt for key "${key}" is missing in constants.ts!`);
    // Return a very basic fallback to prevent crashes, though this indicates a deeper config issue.
    return { promptKey: key, description: "Error: Missing prompt", modelType: 'text-generation', modelName: 'Xenova/distilgpt2', promptTemplate: "Error: prompt template missing for " + key, defaultGenerationParams: {} };
  }
  return prompt;
}

async function getPipeline(task: 'text-generation' | 'text2text-generation', modelNameFromPrompt: string): Promise<Pipeline> {
  const targetModel = modelNameFromPrompt || (task === 'text-generation' ? MODEL_TEXT_GENERATION_DEFAULT : MODEL_TEXT2TEXT_DEFAULT);
  console.log(`[MiniLM - getPipeline] START for task "${task}", model "${targetModel}"`);

  if (task === 'text-generation' && textGenerationPipeline && textGenerationPipeline.model.model_name_or_path === targetModel) {
    console.log(`[MiniLM - getPipeline] Using cached text-generation pipeline for ${targetModel}.`);
    return textGenerationPipeline;
  }
  if (task === 'text2text-generation' && text2textPipeline && text2textPipeline.model.model_name_or_path === targetModel) {
    console.log(`[MiniLM - getPipeline] Using cached text2text-generation pipeline for ${targetModel}.`);
    return text2textPipeline;
  }
  
  let newPipeline: Pipeline;
  try {
    console.log(`[MiniLM - getPipeline] Dynamically importing @xenova/transformers...`);
    const { pipeline, env } = await import('@xenova/transformers');
    // To prevent warnings about ONNX Runtime WebAssembly backend and local models
    env.allowLocalModels = true; 
    env.useFS = true; // Allow filesystem access for models (if running in Node.js)
    // Disable specific checks if they cause issues, e.g. remote model checks if only using local
    // env.allowRemoteModels = false; // If you are ONLY using explicitly local models

    console.log(`[MiniLM - getPipeline] Loading pipeline for task "${task}" with model "${targetModel}"... This might take a moment.`);
    const loadStartTime = Date.now();
    newPipeline = await pipeline(task, targetModel, { 
        // progress_callback: (progress: any) => console.log(`[MiniLM - ${targetModel}] Loading progress:`, progress) 
    });
    const loadEndTime = Date.now();
    console.log(`[MiniLM - getPipeline] Pipeline for task "${task}" model "${targetModel}" LOADED. Time: ${loadEndTime - loadStartTime}ms`);

    if (task === 'text-generation') textGenerationPipeline = newPipeline;
    else if (task === 'text2text-generation') text2textPipeline = newPipeline;
  } catch (error) {
      console.error(`[MiniLM - getPipeline] FAILED to load pipeline for task "${task}" model "${targetModel}":`, error);
      throw error; // Re-throw to be caught by the caller
  }
  
  console.log(`[MiniLM - getPipeline] END for task "${task}", model "${targetModel}"`);
  return newPipeline;
}

function cleanGeneratedText(text: string, promptContent?: string, maxLength?: number): string {
    let cleaned = text;
    if (promptContent) {
      if (cleaned.startsWith(promptContent)) {
          cleaned = cleaned.substring(promptContent.length);
      }
      const promptInstructionEndMarkers = ["Slug:", "Short Description:", "Long Description:", "Alt text:", "Title:", "Meta Description:", "Attributes:", "Tags:"];
      for (const marker of promptInstructionEndMarkers) {
          if (promptContent.includes(marker)) {
              const markerIndex = cleaned.indexOf(marker);
              if (markerIndex !== -1 && markerIndex < promptContent.length) {
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

function interpolatePrompt(promptTemplate: string, data: Record<string, string>): string {
  let result = promptTemplate;
  const ifRegex = /\{\{#if\s+([\w-]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(ifRegex, (match, variableName, innerContent) => {
      return (data[variableName] && data[variableName].trim() !== '') ? innerContent.trim() : '';
  });

  for (const key in data) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), data[key] || '');
  }
  return result;
}

async function generateWithModel(promptKey: AiPromptKey, inputData: Record<string, string>): Promise<string> {
  console.log(`[MiniLM - generateWithModel] START for promptKey: "${promptKey}"`);
  await loadPromptsFromFirestore();
  const promptConfig = getPrompt(promptKey);
  if (!promptConfig) {
    console.error(`[MiniLM Service] Prompt configuration for key "${promptKey}" not found. Cannot generate.`);
    return "";
  }

  const finalPrompt = interpolatePrompt(promptConfig.promptTemplate, inputData);
  console.log(`[MiniLM - generateWithModel - ${promptKey}] Using Model: ${promptConfig.modelName}, Task: ${promptConfig.modelType}. Final Prompt (first 100 chars): ${finalPrompt.substring(0,100)}...`);
  
  let generator: Pipeline;
  try {
    generator = await getPipeline(promptConfig.modelType, promptConfig.modelName);
  } catch (pipelineError) {
     console.error(`[MiniLM - generateWithModel - ${promptKey}] Could not get pipeline. Error:`, pipelineError);
     return ""; // Return empty if pipeline fails
  }


  console.log(`[MiniLM - generateWithModel - ${promptKey}] Calling generator...`);
  const genStartTime = Date.now();
  try {
    const result = await generator(finalPrompt, promptConfig.defaultGenerationParams || {});
    const genEndTime = Date.now();
    console.log(`[MiniLM - generateWithModel - ${promptKey}] Generator finished. Time: ${genEndTime - genStartTime}ms`);

    if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      const instructionPartEnd = finalPrompt.lastIndexOf(":") + 1;
      const promptContentForCleaning = finalPrompt.substring(instructionPartEnd).trim();
      const cleanedText = cleanGeneratedText(result[0].generated_text, promptContentForCleaning);
      console.log(`[MiniLM - generateWithModel - ${promptKey}] END. Generated (cleaned, first 50): ${cleanedText.substring(0,50)}...`);
      return cleanedText;
    } else if (typeof result === 'string') {
      const cleanedText = cleanGeneratedText(result);
      console.log(`[MiniLM - generateWithModel - ${promptKey}] END. Generated (cleaned, first 50): ${cleanedText.substring(0,50)}...`);
      return cleanedText;
    }
    console.warn(`[MiniLM - generateWithModel - ${promptKey}] Unexpected result format from model:`, result);
    console.log(`[MiniLM - generateWithModel - ${promptKey}] END with unexpected format.`);
    return "";
  } catch (e) {
    const genEndTime = Date.now();
    console.error(`[MiniLM - generateWithModel - ${promptKey}] Error during generation after ${genEndTime - genStartTime}ms:`, e);
    console.log(`[MiniLM - generateWithModel - ${promptKey}] END with error.`);
    return "";
  }
}

async function generateSeoFilenameBase(productName: string, visualTags: string[]): Promise<string> {
  console.log(`[MiniLM - SEO Filename] START for ProductName: ${productName}`);
  const inputData = {
    productName,
    visualTagsString: visualTags.slice(0,2).join(', ')
  };
  const slug = await generateWithModel('seoFilenameBase', inputData);
  const cleanedSlug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '').split('-').slice(0,5).join('-') || cleanTextForFilenameHelper(productName);
  console.log(`[MiniLM - SEO Filename] END. Generated: ${cleanedSlug}`);
  return cleanedSlug;
}

function cleanTextForFilenameHelper(text: string): string {
  if (!text) return `imagen-desconocida-${Date.now().toString().slice(-5)}`;
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

async function generateShortDescription(input: MiniLMInput): Promise<string> {
  console.log(`[MiniLM - Short Desc] START for ProductName: ${input.productName}`);
  const inputData = {
    productName: input.productName,
    categoryString: input.category || 'plants',
    visualTagsString: input.visualTags.join(', ') || 'unique beauty',
    existingKeywordsString: input.existingKeywords || 'decorative, easy-care'
  };
  const desc = await generateWithModel('shortDescription', inputData);
  const finalDesc = desc || `Discover the stunning ${input.productName}, a perfect ${input.category || 'addition'} for your collection.`;
  console.log(`[MiniLM - Short Desc] END. Generated (first 50): ${finalDesc.substring(0,50)}...`);
  return finalDesc;
}

async function generateLongDescription(input: MiniLMInput): Promise<string> {
  console.log(`[MiniLM - Long Desc] START for ProductName: ${input.productName}`);
  const attributesString = (input.existingAttributes || []).map(a => `${a.name}: ${a.value}`).join(', ');
  const inputData = {
    productName: input.productName,
    categoryString: input.category || 'Decorative Plants',
    visualTagsString: input.visualTags.join(', ') || 'distinctive appearance',
    existingKeywordsString: input.existingKeywords || 'houseplant, garden, collector item',
    attributesString: attributesString
  };
  const desc = await generateWithModel('longDescription', inputData);
  const finalDesc = desc || `Explore the exquisite ${input.productName}, a prized ${input.category || 'plant'} celebrated for its beauty.`;
  console.log(`[MiniLM - Long Desc] END. Generated (first 50): ${finalDesc.substring(0,50)}...`);
  return finalDesc;
}

async function generateSeoAltText(productName: string, visualTags: string[], category?: string): Promise<string> {
  console.log(`[MiniLM - Alt Text] START for ProductName: ${productName}`);
  const inputData = {
    productName,
    visualTagsString: visualTags.join(', '),
    categoryString: category || 'plant'
  };
  const alt = await generateWithModel('seoAltText', inputData);
  const finalAlt = alt || `${productName} - ${category || ''} - ${visualTags.join(' ')}`.substring(0,125).trim();
  console.log(`[MiniLM - Alt Text] END. Generated: ${finalAlt}`);
  return finalAlt;
}

async function generateSeoTitle(productName: string, category?: string, keywords?: string): Promise<string> {
  console.log(`[MiniLM - SEO Title] START for ProductName: ${productName}`);
  const inputData = {
    productName,
    categoryString: category || 'Plant',
    existingKeywordsString: keywords || productName
  };
  const title = await generateWithModel('seoTitle', inputData);
  const finalTitle = title || `${productName} | ${category || 'Premium Plant'}`.substring(0, 60);
  console.log(`[MiniLM - SEO Title] END. Generated: ${finalTitle}`);
  return finalTitle;
}

async function generateMetaDescription(shortDescriptionInput: string, productName: string): Promise<string> {
    console.log(`[MiniLM - Meta Desc] START for ProductName: ${productName}`);
    if (!shortDescriptionInput && productName) {
        shortDescriptionInput = `High-quality ${productName}, perfect for your collection. Discover more about its unique features and care.`;
    } else if (!shortDescriptionInput && !productName) {
        shortDescriptionInput = "Discover our unique collection of ornamental plants and accessories. High-quality items for enthusiasts.";
    }
    const inputData = { shortDescriptionInput: shortDescriptionInput.substring(0, 500) };
    const metaDesc = await generateWithModel('metaDescription', inputData);
    const finalMetaDesc = metaDesc.substring(0, 160) || shortDescriptionInput.substring(0, 160);
    console.log(`[MiniLM - Meta Desc] END. Generated: ${finalMetaDesc}`);
    return finalMetaDesc;
}

export async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  console.log('[MiniLM Service] START generateContentWithMiniLM. Input ProductName:', input.productName);
  const overallStartTime = Date.now();
  await loadPromptsFromFirestore();

  const { productName, visualTags, category, existingKeywords, existingAttributes } = input;

  const seoFilenameBase = await generateSeoFilenameBase(productName, visualTags);
  const shortDescription = await generateShortDescription(input);
  const longDescription = await generateLongDescription(input);
  const altText = await generateSeoAltText(productName, visualTags, category);
  const seoTitle = await generateSeoTitle(productName, category, existingKeywords);
  const metaDescription = await generateMetaDescription(shortDescription, productName);

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

  const tagsSet = new Set<string>((existingKeywords || '').split(',').map(k => k.trim()).filter(k => k));
  (visualTags || []).forEach(tag => tagsSet.add(tag.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '')));
  if (category) tagsSet.add(category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  tagsSet.add(productName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  const tags = Array.from(tagsSet).slice(0, 10);
  
  const overallEndTime = Date.now();
  console.log(`[MiniLM Service] END generateContentWithMiniLM for ${productName}. Total Time: ${overallEndTime - overallStartTime}ms`);

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

