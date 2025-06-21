
import type { LucideIcon } from 'lucide-react';

// Core navigation type, kept for UI layout
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  external?: boolean;
}

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

export interface ProductPhoto {
  id: string; // Unique ID for the photo (e.g., uuid)
  file?: File; // The actual file object, present only on client-side before upload
  previewUrl: string; // Used for client-side preview (object URL)
  url?: string; // Public URL from custom host, available after upload
  name: string; // filename
  isPrimary?: boolean;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string; // Error message if upload fails
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export type ProductType = 'simple' | 'variable' | 'grouped';

export interface WooCommerceCategory {
    id: number;
    name: string;
    slug: string;
}

export interface ProductData {
  sku: string;
  name: string;
  productType: ProductType;
  regularPrice: string;
  salePrice: string;
  category: string; // Store category slug
  keywords: string;
  shortDescription: string;
  longDescription: string;
  attributes: ProductAttribute[];
  photos: ProductPhoto[];
}

export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[];
  normalizedProductName: string;
}

export type WizardProcessingState = 'idle' | 'uploading' | 'creating' | 'finished' | 'error';
