
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
  name: string; // filename
  isPrimary?: boolean;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string; // Error message if upload fails
  // Fields for the new upload flow
  uploadedUrl?: string; // The URL from the temporary host (quefoto.es)
  uploadedFilename?: string; // The filename on the temporary host
}

export interface ProductAttribute {
  name: string;
  value: string;
  forVariations?: boolean;
}

export interface ProductVariationAttribute {
  name: string;
  value: string;
}

export interface ProductVariation {
  id: string; // client-side UUID
  attributes: ProductVariationAttribute[];
  sku: string;
  regularPrice: string;
  salePrice: string;
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
  category: WooCommerceCategory | null; // Store category object
  keywords: string;
  shortDescription: string;
  longDescription: string;
  attributes: ProductAttribute[];
  photos: ProductPhoto[];
  variations?: ProductVariation[];
  groupedProductIds?: number[];
  language: 'Spanish' | 'English';
  // AI-generated image metadata
  imageTitle?: string;
  imageAltText?: string;
  imageCaption?: string;
  imageDescription?: string;
}

export interface SimpleProductSearchResult {
  id: number;
  name: string;
  price: string;
  image: string | null;
}

export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[];
  normalizedProductName: string;
}

export type WizardProcessingState = 'idle' | 'processing' | 'finished' | 'error';
