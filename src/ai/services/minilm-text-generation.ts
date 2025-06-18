
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

  const { pipeline } = await import('@xenova/transformers');
  const newPipeline = await pipeline(task, model, {
    // progress_callback: (progress: any) => console.log(`[Transformers.js ${model}] Loading progress:`, progress)
  });

  if (task === 'text-generation') textGenerationPipeline = newPipeline;
  else if (task === 'fill-mask') fillMaskPipeline = newPipeline;
  else if (task === 'text2text-generation') text2textPipeline = newPipeline;
  
  console.log(`[Transformers.js] Pipeline for task "${task}" with model "${model}" loaded.`);
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

// Placeholder implementation - THIS NEEDS TO BE FULLY IMPLEMENTED
export async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  console.log('[MiniLM Service] Received input for content generation:', input);

  const { productName, visualTags, category, existingKeywords, existingAttributes } = input;

  // --- 1. SEO Filename Base ---
  // Example: "Agave Cavanillesii" + "succulent" -> "agave-cavanillesii-succulent-plant"
  // This might be better with a simpler string manipulation or a very specific T5 prompt.
  let seoFilenameBase = productName.toLowerCase().replace(/\s+/g, '-');
  if (visualTags.length > 0) {
    seoFilenameBase += `-${visualTags[0].toLowerCase().replace(/\s+/g, '-')}`;
  }
  seoFilenameBase = seoFilenameBase.replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').substring(0, 50);
  console.log(`[MiniLM Service] Tentative SEO Filename Base: ${seoFilenameBase}`);


  // --- 2. Short Description ---
  const shortDescPrompt = `Generate a concise and engaging short e-commerce description (1-2 sentences, about 150 characters) for a product named "${productName}". It is a type of "${category || 'plant'}" and has visual features like "${visualTags.join(', ')}". Keywords: "${existingKeywords || ''}". Focus on its main appeal. For example, for Agave avellanidens: "Agave avellanidens is a striking, drought-tolerant succulent native to Baja California. With its broad blue-green leaves and bold rosette form, it’s perfect for xeriscaping and modern dry-climate gardens." Generated description:`;
  let shortDescription = `Short description for ${productName} - visual tags: ${visualTags.join(', ')}.`; // Placeholder
  try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(shortDescPrompt, { max_new_tokens: 80, num_return_sequences: 1, do_sample: true, temperature: 0.7 });
    if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        shortDescription = cleanGeneratedText(genResult[0].generated_text, shortDescPrompt);
    }
     console.log(`[MiniLM Service] Generated Short Description (raw):`, genResult);
  } catch (e) {
    console.error('[MiniLM Service] Error generating short description:', e);
  }
  console.log(`[MiniLM Service] Final Short Description: ${shortDescription}`);


  // --- 3. Long Description ---
  const longDescPrompt = `Create a detailed and appealing e-commerce long description (2-3 paragraphs) for "${productName}". Category: "${category || 'plant'}". Visual features: "${visualTags.join(', ')}". Keywords: "${existingKeywords || ''}". Existing attributes: "${(existingAttributes || []).map(a => `${a.name}: ${a.value}`).join(', ')}". Include details about its benefits, uses, or care. Write in an enthusiastic, knowledgeable tone. For example, for Agave avellanidens: "Native to the arid landscapes of Baja California, Agave avellanidens, also known as the Baja Agave, is a testament to nature's resilience and beauty..." Generated description:`;
  let longDescription = `Long description for ${productName}, category ${category}. It is ${visualTags.join(', ')}. ${(existingAttributes || []).map(a => `${a.name} is ${a.value}`).join('. ')}. Ideal for ${existingKeywords}.`; // Placeholder
   try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(longDescPrompt, { max_new_tokens: 250, num_return_sequences: 1, do_sample: true, temperature: 0.7 });
    if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        longDescription = cleanGeneratedText(genResult[0].generated_text, longDescPrompt);
    }
    console.log(`[MiniLM Service] Generated Long Description (raw):`, genResult);
  } catch (e) {
    console.error('[MiniLM Service] Error generating long description:', e);
  }
  console.log(`[MiniLM Service] Final Long Description: ${longDescription}`);


  // --- 4. SEO Metadata ---
  const altTextPrompt = `Generate a concise, descriptive SEO alt text (max 120 characters) for an image of "${productName}". Features: "${visualTags.join(', ')}". Category: "${category}". Alt text:`;
  let alt = `${productName} - ${category} - ${visualTags.join(' ')}`.substring(0,125); // Placeholder
  try {
    const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
    const genResult = await generator(altTextPrompt, { max_new_tokens: 30 });
     if (Array.isArray(genResult) && genResult[0] && typeof genResult[0].generated_text === 'string') {
        alt = cleanGeneratedText(genResult[0].generated_text, altTextPrompt).substring(0,125);
    }
  } catch (e) { console.error('[MiniLM Service] Error generating alt text:', e); }
  
  const title = alt; // Title can often be similar to alt text or a slightly expanded version
  const metaDescription = shortDescription.substring(0, 160); // Meta description from short description
  console.log(`[MiniLM Service] Generated SEO: Alt="${alt}", Title="${title}", MetaDesc="${metaDescription}"`);


  // --- 5. Attributes ---
  // This is complex. MiniLM might not be ideal for structured attribute extraction without fine-tuning or very specific prompting.
  // For now, pass existing attributes and maybe add some based on visual tags.
  const attributes: ProductAttribute[] = [...(existingAttributes || [])];
  visualTags.forEach(tag => {
    if (!attributes.find(a => a.name.toLowerCase() === 'visual feature' && a.value.toLowerCase().includes(tag.toLowerCase()))) {
      // Example: attributes.push({ name: 'Visual Feature', value: tag });
    }
  });
  console.log(`[MiniLM Service] Attributes (merged):`, attributes);


  // --- 6. Tags ---
  // Example: combine existing keywords with visual tags, then refine/select with MiniLM if needed.
  const tagsSet = new Set<string>((existingKeywords || '').split(',').map(k => k.trim()).filter(k => k));
  visualTags.forEach(tag => tagsSet.add(tag.replace(/\s+/g, ''))); // Add visual tags as camelCase/noSpace tags
  const tags = Array.from(tagsSet).slice(0, 10); // Limit number of tags
  console.log(`[MiniLM Service] Generated Tags:`, tags);

  return {
    seoFilenameBase,
    shortDescription,
    longDescription,
    seoMetadata: {
      alt,
      title,
      description: metaDescription,
      // caption: `Caption for ${productName}` // Placeholder
    },
    attributes,
    tags,
  };
}
