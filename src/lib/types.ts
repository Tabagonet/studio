
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
  localPath?: string; // Path on the server after local upload (e.g., /user_uploads/raw/batch_id/image.jpg)
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
  assignedCategorySlug: string | undefined | null; 
  id: string; 
  userId: string;
  batchId: string;
  imageName: string; // Original filename
  originalStoragePath: string; // Initially path to local /user_uploads/raw/...
  originalDownloadUrl: string; // Initially path to local /user_uploads/raw/...
  status: "uploaded" | 
          "processing_image_started" | 
          "processing_image_name_parsed" | // New status for Natural.js output
          "processing_image_classified" | // New status for MobileNet output
          "processing_image_content_generated" | // New status for MiniLM output
          "processing_image_downloaded" | // Kept if needed, but flow changes
          "processing_image_validated" | 
          "processing_image_optimized" | // Image optimized by Sharp
          "processing_image_seo_named" | // Kept, but name comes from MiniLM
          "processing_image_metadata_generated" |// Kept, but metadata from MiniLM
          "processing_image_rules_applied" |
          "processing_image_reuploaded" | // This now means uploaded to WooCommerce Media
          "completed_image_pending_woocommerce" | // Image processed locally, ready for WC product
          "error_processing_image" |
          "completed_woocommerce_integration" | 
          "error_woocommerce_integration";    
  uploadedAt: Timestamp; 
  updatedAt?: Timestamp; 
  progress: number;
  seoName?: string; // SEO filename from MiniLM (e.g. agave-cavanillesii-awesome.webp)
  processedImageStoragePath?: string; // Path to local /user_uploads/processed/...
  processedImageDownloadUrl?: string; // Path to local /user_uploads/processed/... (can be same as storage path)
  wooCommerceMediaId?: number; // ID from WooCommerce after media upload
  resolutions?: Record<string, string>; 
  seoMetadata?: { alt?: string; title?: string, description?: string, caption?: string }; // Expanded
  errorMessage?: string;
  productAssociationId?: string; 
  assignedCategory?: string; 
  assignedTags?: string[];
  productContext?: WizardProductContext; 
  parsedNameData?: ParsedNameData; // From Natural.js
  visualTags?: string[]; // From MobileNetV2
  generatedContent?: GeneratedProductContent; // From MiniLM
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
}

// Types for AI Product Description Generation (Genkit - will be replaced/augmented)
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

// For Natural.js filename parsing
export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[]; // e.g. "1" from "product-1.jpg"
  normalizedProductName: string;
}

// For MiniLM content generation
export interface MiniLMInput {
  productName: string; // From Natural.js
  visualTags: string[]; // From MobileNetV2
  category?: string;
  existingKeywords?: string;
  existingAttributes?: ProductAttribute[];
  // potentially add existing template content here
}

export interface GeneratedProductContent {
  seoFilenameBase: string; // e.g., "agave-cavanillesii-succulent-plant" (without .webp)
  shortDescription: string;
  longDescription: string;
  seoMetadata: {
    alt: string;
    title: string;
    description?: string; // Meta description
    caption?: string; // Image caption if applicable
  };
  attributes: ProductAttribute[]; // Suggested or refined attributes
  tags: string[]; // Suggested tags
}

// For Firestore SEO History
export interface SeoHistoryEntry {
  id?: string; // Firestore document ID
  batchId: string;
  originalImageName: string;
  productId?: string | number; // WooCommerce Product ID
  productName: string; // Name used for generation
  seoName?: string; // Filename
  shortDescription?: string;
  longDescription?: string;
  seoMetadata?: GeneratedProductContent['seoMetadata'];
  tags?: string[];
  attributes?: ProductAttribute[];
  category?: string;
  processedAt: Timestamp;
}

