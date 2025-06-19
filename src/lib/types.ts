
import type { LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  external?: boolean;
}

export interface ProductPhoto {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  isPrimary?: boolean;
  seoAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoCaption?: string;
  localPath?: string;
  externalUrl?: string;
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export type ProductType = 'simple' | 'variable' | 'grouped';

export interface ProductData {
  sku: string;
  name: string;
  productType: ProductType;
  regularPrice: string;
  salePrice?: string;
  category: string;
  keywords: string;
  shortDescription: string;
  longDescription: string;
  attributes: ProductAttribute[];
  photos: ProductPhoto[];
}

export type TemplateType = 'nombre_seo' | 'descripcion_corta' | 'descripcion_larga' | 'metadatos_seo';
export type TemplateScope = 'global' | 'categoria_especifica';

export interface ProductTemplate {
  id: string;
  name: string;
  type: TemplateType;
  content: string;
  scope: TemplateScope;
  categoryValue?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface ProductTemplateFormValues {
  name: string;
  type: TemplateType;
  content: string;
  scope: TemplateScope;
  categoryValue?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  keyword: string;
  categoryToAssign?: string;
  tagsToAssign?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AutomationRuleFormValues {
  name: string;
  keyword: string;
  categoryToAssign?: string;
  tagsToAssign?: string;
}


export interface ApiKeys {
  wooCommerceKey?: string;
  wooCommerceSecret?: string;
  firebaseConfig?: string;
  vercelEndpoint?: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: 'success' | 'error' | 'info' | 'warning';
  timestamp: Timestamp;
  isRead: boolean;
  linkTo?: string;
}

export type AttributeSuggestion = string;

export interface WizardProductContext {
  shortDescription: string;
  longDescription: string;
  name: string;
  sku: string;
  productType: ProductType;
  regularPrice: string;
  salePrice?: string;
  category: string;
  keywords: string;
  attributes: ProductAttribute[];
  isPrimary: boolean;
}


export interface ProcessingStatusEntry {
  assignedCategorySlug?: string | null; // Allow null
  id: string;
  userId: string;
  batchId: string;
  imageName: string;
  originalStoragePath: string;
  originalDownloadUrl: string;
  status: "uploaded" |
          "processing_image_started" |
          "processing_image_name_parsed" |
          "processing_image_classified" |
          "processing_image_content_generated" |
          "processing_image_downloaded" |
          "processing_image_validated" |
          "processing_image_optimized" |
          "processing_image_seo_named" |
          "processing_image_metadata_generated" |
          "processing_image_rules_applied" |
          "processing_image_reuploaded" |
          "completed_image_pending_woocommerce" |
          "error_processing_image" |
          "completed_woocommerce_integration" |
          "error_woocommerce_integration";
  uploadedAt: Timestamp;
  updatedAt?: Timestamp;
  progress: number;
  seoName?: string;
  processedImageStoragePath?: string;
  processedImageDownloadUrl?: string;
  wooCommerceMediaId?: number;
  resolutions?: Record<string, string>;
  seoMetadata?: { alt?: string; title?: string, description?: string, caption?: string };
  errorMessage?: string;
  productAssociationId?: string;
  // assignedCategory?: string; // Replaced by assignedCategorySlug for consistency
  assignedTags?: string[];
  productContext?: WizardProductContext;
  parsedNameData?: ParsedNameData;
  visualTags?: string[];
  generatedContent?: GeneratedProductContent;
  lastMessage?: string;
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
}

export interface GenerateProductDescriptionInput {
  productName: string;
  categoryName?: string;
  keywords?: string;
  attributesSummary?: string;
}

export interface GenerateProductDescriptionOutput {
  shortDescription?: string;
  longDescription?: string;
}

export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[];
  normalizedProductName: string;
}

export interface MiniLMInput {
  productName: string;
  visualTags: string[];
  category?: string;
  existingKeywords?: string;
  existingAttributes?: ProductAttribute[];
}

export interface GeneratedProductContent {
  seoFilenameBase: string;
  shortDescription: string;
  longDescription: string;
  seoMetadata: {
    alt: string;
    title: string;
    description?: string;
    caption?: string;
  };
  attributes: ProductAttribute[];
  tags: string[];
}

export interface SeoHistoryEntry {
  id?: string;
  batchId: string;
  originalImageName: string;
  productId?: string | number;
  productName: string;
  seoName?: string;
  shortDescription?: string;
  longDescription?: string;
  seoMetadata?: GeneratedProductContent['seoMetadata'];
  tags?: string[];
  attributes?: ProductAttribute[];
  category?: string | null; // Allow null
  processedAt: Timestamp;
}

export type AiPromptKey =
  | 'seoFilenameBase'
  | 'shortDescription'
  | 'longDescription'
  | 'seoAltText'
  | 'seoTitle'
  | 'metaDescription'
  | 'suggestAttributes'
  | 'suggestTags';

export interface AiPrompt {
  id: string; 
  promptKey: AiPromptKey;
  description: string;
  modelType: 'text-generation' | 'text2text-generation';
  modelName: string; 
  promptTemplate: string;
  defaultGenerationParams: Record<string, any>; 
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface AiPromptFormValues {
  promptKey: AiPromptKey; 
  description: string;
  modelType: 'text-generation' | 'text2text-generation';
  modelName: string;
  promptTemplate: string;
  defaultGenerationParamsText: string; 
}
