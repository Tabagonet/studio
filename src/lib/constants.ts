
import { Home, Wand2, FileText, Cog, Bell, Settings, ShoppingBag, PackagePlus, ListChecks, Tags, Layers, Brain } from 'lucide-react';
import type { NavItem, TemplateType, TemplateScope, ProductType, AiPromptKey, AiPrompt } from '@/lib/types';

export const APP_NAME = "WooAutomate";

export const NAV_ITEMS: NavItem[] = [
  {
    title: 'Panel de Control',
    href: '/',
    icon: Home,
  },
  {
    title: 'Asistente de Creación',
    href: '/wizard',
    icon: Wand2,
  },
  {
    title: 'Procesamiento en Lotes',
    href: '/batch',
    icon: Layers,
  },
  {
    title: 'Gestión de Plantillas',
    href: '/templates',
    icon: FileText,
  },
  {
    title: 'Reglas de Automatización',
    href: '/rules',
    icon: Cog,
  },
  {
    title: 'Gestión de Prompts IA',
    href: '/prompts',
    icon: Brain,
  },
  {
    title: 'Notificaciones',
    href: '/notifications',
    icon: Bell,
  },
  {
    title: 'Configuración',
    href: '/settings',
    icon: Settings,
  },
];

export const WIZARD_STEPS = [
  { id: '01', name: 'Detalles y Fotos', description: 'Información básica y carga de imágenes.' },
  { id: '02', name: 'Vista Previa', description: 'Revisa y edita el producto.' },
  { id: '03', name: 'Confirmación', description: 'Finaliza y procesa.' },
];


export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'simple', label: 'Producto Simple (Físico)' },
  { value: 'variable', label: 'Producto Variable' },
  { value: 'grouped', label: 'Producto Agrupado' },
];

export const INITIAL_PRODUCT_DATA = {
  sku: "",
  name: "",
  productType: 'simple' as ProductType,
  regularPrice: "",
  salePrice: "",
  category: "",
  keywords: "",
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: "", value: "" }],
  photos: [],
};

export const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'nombre_seo', label: 'Nombre SEO Producto' },
  { value: 'descripcion_corta', label: 'Descripción Corta SEO' },
  { value: 'descripcion_larga', label: 'Descripción Larga SEO' },
  { value: 'metadatos_seo', label: 'Metadatos SEO (Meta Título/Descripción)' },
];

export const TEMPLATE_SCOPES: { value: TemplateScope; label: string }[] = [
  { value: 'global', label: 'Global (Todos los productos)' },
  { value: 'categoria_especifica', label: 'Categoría Específica' },
];

export const PRODUCT_TEMPLATES_COLLECTION = "product_templates";
export const AUTOMATION_RULES_COLLECTION = "automation_rules";
export const APP_NOTIFICATIONS_COLLECTION = "app_notifications";
export const SEO_HISTORY_COLLECTION = "seo_history";
export const AI_PROMPTS_COLLECTION = "ai_prompts";

const MODEL_TEXT_GENERATION_DEFAULT = 'Xenova/distilgpt2';
const MODEL_TEXT2TEXT_DEFAULT = 'Xenova/t5-small';

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
