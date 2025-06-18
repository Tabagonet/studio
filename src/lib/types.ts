
import type { LucideIcon } from 'lucide-react';

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
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export interface ProductData {
  sku: string;
  name: string;
  regularPrice: string;
  salePrice?: string;
  category: string;
  keywords: string;
  shortDescription: string;
  longDescription: string;
  attributes: ProductAttribute[];
  photos: ProductPhoto[];
  // Future fields for variations
  // type: 'simple' | 'variable';
  // variations?: ProductVariation[];
}

export interface Template {
  id: string;
  name: string;
  type: 'seoName' | 'description' | 'seoMetadata';
  content: string;
  categoryScope?: string; // Optional category to which this template applies by default
  isDefault?: boolean;
}

export interface AutomationRule {
  id:string;
  keyword: string;
  category?: string;
  tags?: string[];
}

export interface ApiKeys {
  wooCommerceKey?: string;
  wooCommerceSecret?: string;
  firebaseConfig?: string; // JSON string for Firebase config
  vercelEndpoint?: string;
}

export interface AppNotification {
  id: string;
  timestamp: Date;
  message: string;
  type: 'success' | 'error' | 'info';
  read: boolean;
}

// Type for AI attribute suggestion
export type AttributeSuggestion = string;

// Type for Firestore documents in 'processing_status' collection
export interface ProcessingStatusEntry {
  id: string; // Firestore document ID
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
          "processing_image_reuploaded" | 
          "completed_image_pending_woocommerce" | 
          "error_processing_image" |
          "completed_woocommerce_integration" | // Future status
          "error_woocommerce_integration";     // Future status
  uploadedAt: any; // Firebase Timestamp or ServerTimestampFieldValue
  updatedAt?: any; // Firebase Timestamp or ServerTimestampFieldValue
  progress: number;
  seoName?: string;
  processedImageStoragePath?: string;
  processedImageDownloadUrl?: string;
  resolutions?: Record<string, string>; // e.g., { "800x800": "url", "300x300": "url" }
  seoMetadata?: { alt?: string; title?: string };
  errorMessage?: string;
  productAssociationId?: string; // WooCommerce Product ID, if/when created
}

    