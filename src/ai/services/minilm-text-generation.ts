
'use server';
/**
 * @fileOverview Service for text generation using MiniLM (or other models from Transformers.js).
 * This service will be responsible for generating various product content fields.
 */
import type { Pipeline } from '@xenova/transformers';
import type { MiniLMInput, GeneratedProductContent, ProductAttribute } from '@/lib/types';

// Lazy load the pipeline
let textGenerationPipeline: Pipeline | null = null;
let fillMaskPipeline: Pipeline | null = null;
let text2textPipeline: Pipeline | null = null;

const MODEL_TEXT_GENERATION = 'Xenova/distilgpt2'; // Example model, can be configured
const MODEL_FILL_MASK = 'Xenova/bert-base-uncased'; // Example for attribute/tag refinement if needed
const MODEL_TEXT2TEXT = 'Xenova/t5-small'; // Example for specific transformations like SEO name

async function getPipeline(task: string, model: string): Promise<Pipeline> {
  if (task === 'text-generation' && textGenerationPipeline) return textGenerationPipeline;
  if (task === 'fill-mask' && fillMaskPipeline) return fillMaskPipeline;
  if (task === 'text2text-generation' && text2textPipeline) return text2textPipeline;

  console.log(`[Transformers.js] Attempting to load pipeline for task "${task}" with model "${model}"...`);
  const { pipeline } = await import('@xenova/transformers');
  const newPipeline = await pipeline(task, model, {
    // progress_callback: (progress: any) => console.log(`[Transformers.js ${model}] Loading progress:`, progress)
  });

  if (task === 'text-generation') textGenerationPipeline = newPipeline;
  else if (task === 'fill-mask') fillMaskPipeline = newPipeline;
  else if (task === 'text2text-generation') text2textPipeline = newPipeline;
  
  console.log(`[Transformers.js] Pipeline for task "${task}" with model "${model}" loaded successfully.`);
  return newPipeline;
}

function cleanGeneratedText(text: string, prompt?: string): string {
    let cleaned = text;
    if (prompt && cleaned.startsWith(prompt)) {
        cleaned = cleaned.substring(prompt.length);
    }
    // Remove common model artifacts like "Output:", "Generated text:", etc.
    cleaned = cleaned.replace(/^(Output:|Generated text:|Answer:|Response:)\s*/i, '');
    // Trim whitespace and common model padding/hallucinations
    cleaned = cleaned.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    // Remove incomplete sentences at the end if they are very short
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1 && sentences[sentences.length - 1].length < 20 && !/[.!?]$/.test(sentences[sentences.length-1])) {
        cleaned = sentences.slice(0, -1).join(' ');
    }
    return cleaned.trim();
}

// Placeholder implementation - THIS NEEDS TO BE FULLY IMPLEMENTED by the user
// with actual model loading and prompt engineering.
export async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  console.log('[MiniLM Service] Received input for content generation:', JSON.stringify(input, null, 2));

  const { productName, visualTags, category, existingKeywords, existingAttributes } = input;

  // --- 1. SEO Filename Base ---
  // Example: "Agave Cavanillesii" + "succulent" -> "agave-cavanillesii-succulent-plant"
  let seoFilenameBase = productName.toLowerCase().replace(/\s+/g, '-');
  if (visualTags && visualTags.length > 0) {
    seoFilenameBase += `-${visualTags[0].toLowerCase().replace(/\s+/g, '-')}`;
  }
  seoFilenameBase = seoFilenameBase.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').substring(0, 50);
  console.log(`[MiniLM Service] Tentative SEO Filename Base: ${seoFilenameBase}`);


  // --- 2. Short Description ---
  // For placeholder, we'll make it very basic. User needs to implement actual generation.
  const shortDescPrompt = `Generate a concise e-commerce short description (1-2 sentences, ~150 chars) for "${productName}". Category: ${category || 'plant'}. Visuals: ${visualTags.join(', ')}. Keywords: ${existingKeywords || ''}. Short Description:`;
  let shortDescription = `A beautiful ${productName}, perfect for ${category || 'any collection'}. Features: ${visualTags.join(', ')}.`;
  try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(shortDescPrompt, { max_new_tokens: 80, num_return_sequences: 1, do_sample: true, temperature: 0.7 });
    if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        shortDescription = cleanGeneratedText(genResult[0].generated_text, shortDescPrompt);
    }
     console.log(`[MiniLM Service] Generated Short Description (raw):`, genResult);
  } catch (e) {
    console.error('[MiniLM Service] Error generating short description with actual model, using placeholder:', e);
  }
  console.log(`[MiniLM Service] Final Short Description: ${shortDescription}`);


  // --- 3. Long Description ---
  const longDescPrompt = `Create a detailed e-commerce long description (2-3 paragraphs) for "${productName}". Category: ${category || 'plant'}. Visuals: ${visualTags.join(', ')}. Keywords: ${existingKeywords || ''}. Attributes: ${(existingAttributes || []).map(a => `${a.name}: ${a.value}`).join(', ')}. Long Description:`;
  let longDescription = `Explore the wonderful ${productName}, a type of ${category || 'plant'}. It showcases ${visualTags.join(', ')} and is known for ${existingKeywords || 'its unique beauty'}. `;
  if (existingAttributes && existingAttributes.length > 0) {
    longDescription += `Key features include ${existingAttributes.map(a => `${a.name} (${a.value})`).join(', ')}.`;
  }
   try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(longDescPrompt, { max_new_tokens: 250, num_return_sequences: 1, do_sample: true, temperature: 0.7 });
    if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        longDescription = cleanGeneratedText(genResult[0].generated_text, longDescPrompt);
    }
    console.log(`[MiniLM Service] Generated Long Description (raw):`, genResult);
  } catch (e) {
    console.error('[MiniLM Service] Error generating long description with actual model, using placeholder:', e);
  }
  console.log(`[MiniLM Service] Final Long Description: ${longDescription}`);


  // --- 4. SEO Metadata ---
  const altTextPrompt = `SEO alt text (max 120 chars) for image of "${productName}". Visuals: ${visualTags.join(', ')}. Category: ${category}. Alt text:`;
  let alt = `${productName} - ${category || ''} - ${visualTags.join(' ')}`.substring(0,125).trim();
  try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(altTextPrompt, { max_new_tokens: 30 });
     if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        alt = cleanGeneratedText(genResult[0].generated_text, altTextPrompt).substring(0,125);
    }
  } catch (e) { console.error('[MiniLM Service] Error generating alt text with actual model, using placeholder:', e); }
  
  const title = `${productName} | ${category || 'Premium Plant'} | ${(existingKeywords || visualTags[0] || 'Shop Now')}`.substring(0, 60);
  const metaDescription = shortDescription.substring(0, 160);
  console.log(`[MiniLM Service] Generated SEO: Alt="${alt}", Title="${title}", MetaDesc="${metaDescription}"`);


  // --- 5. Attributes ---
  const attributes: ProductAttribute[] = [...(existingAttributes || [])];
  // Basic example: add visual tags as attributes if not present
  (visualTags || []).forEach(tag => {
    const tagName = tag.split(' ')[0]; // e.g., "bluish-green" -> "bluish" or "spiky" -> "spiky"
    if (tagName && !attributes.find(a => a.name.toLowerCase() === 'feature' && a.value.toLowerCase().includes(tag.toLowerCase()))) {
      attributes.push({ name: 'Visual Feature', value: tag });
    }
  });
  // If no attributes, add a generic one
  if (attributes.length === 0) {
    attributes.push({name: "Origin", value: "Special Nursery"});
  }
  console.log(`[MiniLM Service] Attributes (merged/placeholder):`, attributes);


  // --- 6. Tags ---
  const tagsSet = new Set<string>((existingKeywords || '').split(',').map(k => k.trim()).filter(k => k));
  (visualTags || []).forEach(tag => tagsSet.add(tag.replace(/\s+/g, ''))); // Add visual tags as camelCase/noSpace tags
  if (category) tagsSet.add(category.replace(/\s+/g, ''));
  tagsSet.add(productName.replace(/\s+/g, ''));
  const tags = Array.from(tagsSet).slice(0, 10); // Limit number of tags
  console.log(`[MiniLM Service] Generated Tags (placeholder):`, tags);

  return {
    seoFilenameBase,
    shortDescription,
    longDescription,
    seoMetadata: {
      alt,
      title,
      description: metaDescription,
      // caption: `A beautiful ${productName}` // Placeholder
    },
    attributes,
    tags,
  };
}

    
    