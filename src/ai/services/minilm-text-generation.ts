
'use server';
/**
 * @fileOverview Service for text generation using Transformers.js models (e.g., MiniLM, DistilGPT2, T5).
 * This service is responsible for generating various product content fields using local AI models.
 */
import type { Pipeline } from '@xenova/transformers';
import type { MiniLMInput, GeneratedProductContent, ProductAttribute } from '@/lib/types';

// Lazy load pipelines to cache models after first load
let textGenerationPipeline: Pipeline | null = null; // For models like GPT-2, DistilGPT-2
let text2textPipeline: Pipeline | null = null;    // For models like T5

const MODEL_TEXT_GENERATION = 'Xenova/distilgpt2';      // Good for creative text, descriptions
const MODEL_TEXT2TEXT = 'Xenova/t5-small';              // Good for specific transformations like SEO names, summarization

async function getPipeline(task: 'text-generation' | 'text2text-generation', model: string): Promise<Pipeline> {
  if (task === 'text-generation' && textGenerationPipeline && textGenerationPipeline.model.model_name_or_path === model) return textGenerationPipeline;
  if (task === 'text2text-generation' && text2textPipeline && text2textPipeline.model.model_name_or_path === model) return text2textPipeline;

  console.log(`[Transformers.js] Attempting to load pipeline for task "${task}" with model "${model}"...`);
  const { pipeline } = await import('@xenova/transformers');
  
  // Temporarily disable progress callback for cleaner logs during generation
  const newPipeline = await pipeline(task, model, { /* progress_callback: (progress: any) => console.log(`[Transformers.js ${model}] Loading:`, progress) */ });

  if (task === 'text-generation') textGenerationPipeline = newPipeline;
  else if (task === 'text2text-generation') text2textPipeline = newPipeline;
  
  console.log(`[Transformers.js] Pipeline for task "${task}" with model "${model}" loaded successfully.`);
  return newPipeline;
}

function cleanGeneratedText(text: string, prompt?: string, maxLength?: number): string {
    let cleaned = text;
    if (prompt && cleaned.startsWith(prompt)) {
        cleaned = cleaned.substring(prompt.length);
    }
    cleaned = cleaned.replace(/^(Output:|Generated text:|Answer:|Response:)\s*/i, '');
    cleaned = cleaned.trim().replace(/^["'\s]+|["'\s]+$/g, '');
    
    // Attempt to remove incomplete sentences or very short trailing text
    const sentences = cleaned.split(/(?<=[.!?])\s+/);
    if (sentences.length > 1 && sentences[sentences.length - 1].length < 25 && !/[.!?]$/.test(sentences[sentences.length-1])) {
        cleaned = sentences.slice(0, -1).join(' ').trim();
    }
    // Ensure it ends with a punctuation if it's a descriptive text.
    if (cleaned.length > 30 && !/[.!?]$/.test(cleaned)) {
        cleaned += '.';
    }
    
    if (maxLength && cleaned.length > maxLength) {
        cleaned = cleaned.substring(0, maxLength).trim();
        // Try to cut at last word boundary
        const lastSpace = cleaned.lastIndexOf(' ');
        if (lastSpace > 0) cleaned = cleaned.substring(0, lastSpace);
        if (!/[.!?]$/.test(cleaned)) cleaned += '...';
    }
    return cleaned.trim();
}

async function generateSeoFilenameBase(productName: string, visualTags: string[]): Promise<string> {
  const generator = await getPipeline('text2text-generation', MODEL_TEXT2TEXT);
  const prompt = `Create a concise, SEO-friendly filename slug (lowercase, hyphens, max 4-5 words) for a product named "${productName}" with visual features like "${visualTags.slice(0,2).join(', ')}". Example: for "Agave Titanota Blue", result: "agave-titanota-blue-succulent". Slug:`;
  try {
    const result = await generator(prompt, { max_new_tokens: 20, num_beams: 2 });
    if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      let slug = cleanGeneratedText(result[0].generated_text, prompt.substring(prompt.indexOf("Slug:")+5).trim());
      slug = slug.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
      return slug.split('-').slice(0,5).join('-') || cleanTextForFilename(productName); // Fallback
    }
  } catch (e) { console.error('[MiniLM] Error generating SEO filename:', e); }
  return cleanTextForFilename(productName); // Fallback to simple cleaning
}

function cleanTextForFilename(text: string): string { // Helper if needed
  if (!text) return `imagen-desconocida-${Date.now().toString().slice(-5)}`;
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}


async function generateShortDescription(input: MiniLMInput): Promise<string> {
  const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
  const prompt = `Write a captivating and concise e-commerce short description (1-2 sentences, around 150 characters) for an ornamental plant named "${input.productName}". 
  It is in the category "${input.category || 'plants'}". 
  Key visual characteristics are: ${input.visualTags.join(', ') || 'unique beauty'}. 
  Relevant keywords include: ${input.existingKeywords || 'decorative, easy-care'}. 
  Highlight its main appeal for a plant enthusiast. Short Description:`;
  try {
    const result = await generator(prompt, { max_new_tokens: 70, temperature: 0.7, num_return_sequences: 1, do_sample: true });
    if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      return cleanGeneratedText(result[0].generated_text, prompt.substring(prompt.indexOf("Short Description:")+18).trim(), 200);
    }
  } catch (e) { console.error('[MiniLM] Error generating short description:', e); }
  return `Discover the stunning ${input.productName}, a perfect ${input.category || 'addition'} for your collection, known for its ${input.visualTags.join(', ') || 'unique charm'}.`; // Fallback
}

async function generateLongDescription(input: MiniLMInput): Promise<string> {
  const generator = await getPipeline('text-generation', MODEL_TEXT_GENERATION);
  const attributesString = (input.existingAttributes || []).map(a => `${a.name}: ${a.value}`).join(', ');
  const prompt = `Create a detailed and engaging e-commerce long description (2-3 paragraphs) for the ornamental plant "${input.productName}".
  Category: ${input.category || 'Decorative Plants'}.
  Visual Features: ${input.visualTags.join(', ') || 'distinctive appearance'}.
  Keywords: ${input.existingKeywords || 'houseplant, garden, collector item'}.
  ${attributesString ? `Known Attributes: ${attributesString}.` : ''}
  Describe its origins (if commonly known for this type), care tips (e.g., light, water, soil), and how it can enhance a living space or garden. Maintain an enthusiastic and knowledgeable tone. Long Description:`;
  try {
    const result = await generator(prompt, { max_new_tokens: 300, temperature: 0.75, do_sample: true });
     if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      return cleanGeneratedText(result[0].generated_text, prompt.substring(prompt.indexOf("Long Description:")+17).trim());
    }
  } catch (e) { console.error('[MiniLM] Error generating long description:', e); }
  return `Explore the exquisite ${input.productName}, a prized ${input.category || 'plant'} celebrated for its ${input.visualTags.join(', ') || 'striking beauty'}. ${attributesString ? `It features ${attributesString}. ` : ''}This plant is a fantastic choice for both novice and experienced gardeners, adding a touch of nature's artistry to any setting. Proper care will ensure it thrives and brings joy for years to come.`; // Fallback
}

async function generateSeoAltText(productName: string, visualTags: string[], category?: string): Promise<string> {
  const generator = await getPipeline('text2text-generation', MODEL_TEXT2TEXT);
  const prompt = `Generate a concise and descriptive SEO alt text (max 120 characters) for an image of the plant "${productName}". Key visual features: "${visualTags.join(', ')}". Category: "${category || 'plant'}". Alt text:`;
  try {
    const result = await generator(prompt, { max_new_tokens: 30 });
    if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      return cleanGeneratedText(result[0].generated_text, prompt.substring(prompt.indexOf("Alt text:")+9).trim(), 125);
    }
  } catch (e) { console.error('[MiniLM] Error generating alt text:', e); }
  return `${productName} - ${category || ''} - ${visualTags.join(' ')}`.substring(0,125).trim(); // Fallback
}

async function generateSeoTitle(productName: string, category?: string, keywords?: string): Promise<string> {
  const generator = await getPipeline('text2text-generation', MODEL_TEXT2TEXT);
  const prompt = `Create a compelling SEO title (max 60 characters) for the product page of "${productName}". Category: "${category || 'Plant'}". Keywords: "${keywords || productName}". Title:`;
   try {
    const result = await generator(prompt, { max_new_tokens: 20 });
     if (Array.isArray(result) && result[0] && typeof result[0].generated_text === 'string') {
      return cleanGeneratedText(result[0].generated_text, prompt.substring(prompt.indexOf("Title:")+6).trim(), 60);
    }
  } catch (e) { console.error('[MiniLM] Error generating SEO title:', e); }
  return `${productName} | ${category || 'Premium Plant'} | ${(keywords || visualTags[0] || 'Shop Now')}`.substring(0, 60); // Fallback
}


export async function generateContentWithMiniLM(
  input: MiniLMInput
): Promise<GeneratedProductContent> {
  console.log('[MiniLM Service] Received input for REAL content generation:', JSON.stringify(input, null, 2));

  const { productName, visualTags, category, existingKeywords, existingAttributes } = input;

  const seoFilenameBase = await generateSeoFilenameBase(productName, visualTags);
  console.log(`[MiniLM Service] Generated SEO Filename Base: ${seoFilenameBase}`);

  const shortDescription = await generateShortDescription(input);
  console.log(`[MiniLM Service] Generated Short Description: ${shortDescription.substring(0,100)}...`);
  
  const longDescription = await generateLongDescription(input);
  console.log(`[MiniLM Service] Generated Long Description: ${longDescription.substring(0,100)}...`);

  const altText = await generateSeoAltText(productName, visualTags, category);
  const seoTitle = await generateSeoTitle(productName, category, existingKeywords);
  const metaDescription = shortDescription.substring(0, 160); // Often re-use or summarize shortDesc
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
  if (attributes.length === 0) attributes.push({name: "Origen", value: "Vivero Especializado"});
  console.log(`[MiniLM Service] Final Attributes:`, attributes);

  // Tags: Combine keywords, visual tags, category, product name. More sophisticated generation could be a separate prompt.
  const tagsSet = new Set<string>((existingKeywords || '').split(',').map(k => k.trim()).filter(k => k));
  (visualTags || []).forEach(tag => tagsSet.add(tag.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''))); 
  if (category) tagsSet.add(category.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  tagsSet.add(productName.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, ''));
  const tags = Array.from(tagsSet).slice(0, 10); // Limit number of tags
  console.log(`[MiniLM Service] Final Tags:`, tags);

  return {
    seoFilenameBase,
    shortDescription,
    longDescription,
    seoMetadata: {
      alt: altText,
      title: seoTitle,
      description: metaDescription,
      // caption: `Una hermosa ${productName}` // Caption generation could be another prompt
    },
    attributes,
    tags,
  };
}
