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
