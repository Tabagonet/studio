
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
  category: string; // Guardará el slug de la categoría de WooCommerce
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
  categoryValue?: string; // Sigue siendo el slug para compatibilidad con plantillas existentes
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
  categoryToAssign?: string; // Sigue siendo el slug para compatibilidad
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

// Product context to be stored with ProcessingStatusEntry for wizard flow
export interface WizardProductContext {
  name: string;
  sku: string;
  productType: ProductType;
  regularPrice: string;
  salePrice?: string;
  category: string; // Slug de la categoría de WooCommerce
  keywords: string;
  attributes: ProductAttribute[];
  isPrimary: boolean; 
}


export interface ProcessingStatusEntry {
  id: string; 
  userId: string;
  batchId: string;
  imageName: string;
  originalStoragePath: string; 
  originalDownloadUrl: string; 
  status: "uploaded" | 
          "processing_image_started" | 
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
  resolutions?: Record<string, string>; 
  seoMetadata?: { alt?: string; title?: string };
  errorMessage?: string;
  productAssociationId?: string; 
  assignedCategory?: string; 
  assignedTags?: string[];
  productContext?: WizardProductContext; 
}

export interface WooCommerceCategory {
  id: number;
  name: string;
  slug: string;
}
