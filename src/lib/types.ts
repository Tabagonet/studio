
import type { LucideIcon } from 'lucide-react';
import type { AnalysisResult } from '@/components/features/seo/analysis-view';

// Core navigation type, kept for UI layout
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  external?: boolean;
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

export interface ProductPhoto {
  id: string | number; // Unique ID, can be number (from Woo) or string (from client)
  file?: File; // The actual file object, present only on client-side before upload
  previewUrl: string; // Used for client-side preview (object URL or existing src)
  name: string; // filename
  isPrimary?: boolean; 
  status: UploadStatus;
  progress: number; // 0-100
  error?: string; // Error message if upload fails
  // Fields for the new upload flow
  uploadedUrl?: string; // The URL from the temporary host (quefoto.es)
  uploadedFilename?: string; // The filename on the temporary host
}

export interface WooCommerceImage {
  id: number;
  date_created: string;
  date_modified: string;
  src: string;
  name: string;
  alt: string;
}

export interface ProductAttribute {
  name: string;
  value: string;
  forVariations?: boolean;
  visible?: boolean;
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
  stockQuantity: string;
}


export type ProductType = 'simple' | 'variable' | 'grouped' | 'external';

export interface WooCommerceCategory {
    id: number;
    name: string;
    slug: string;
    parent: number;
}

export interface WordPressPostCategory {
    id: number;
    name: string;
    slug: string;
    parent: number;
    count: number;
}

export interface WordPressUser {
    id: number;
    name: string;
    slug: string;
    avatar_urls: { [key: string]: string };
}

export interface BlogPostData {
  title: string;
  content: string;
  topic: string; // for AI
  keywords: string; // for AI and tags
  focusKeyword: string;
  metaDescription: string;
  category: WordPressPostCategory | null;
  categoryPath?: string;
  status: 'publish' | 'draft' | 'pending';
  featuredImage: ProductPhoto | null;
  sourceLanguage: string;
  targetLanguages: string[];
  author: WordPressUser | null;
  publishDate: Date | null;
}

export interface BlogPostSearchResult {
  id: number;
  title: string;
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private';
  date_created: string;
  author_name: string;
  featured_image_url: string | null;
  categories: { id: number; name: string }[];
  tags: { id: number; name: string }[];
  lang?: string;
  translations?: Record<string, number>;
}

export type HierarchicalBlogPost = BlogPostSearchResult & { subRows: HierarchicalBlogPost[] };


export interface ProductData {
  sku: string;
  shouldSaveSku?: boolean;
  name: string;
  productType: ProductType;
  regularPrice: string;
  salePrice: string;
  stockQuantity: string;
  category: WooCommerceCategory | null; // Store category object
  categoryPath?: string; // Used for batch creation by name/path
  keywords: string;
  shortDescription: string;
  longDescription: string;
  attributes: ProductAttribute[];
  photos: ProductPhoto[]; // Unified to always use ProductPhoto type
  variations?: ProductVariation[];
  groupedProductIds?: number[];
  language: 'Spanish' | 'English' | 'French' | 'German' | 'Portuguese';
  targetLanguages?: string[];
  // AI-generated image metadata
  imageTitle?: string;
  imageAltText?: string;
  imageCaption?: string;
  imageDescription?: string;
  source?: 'wizard' | 'batch';
}

export interface ProductSearchResult {
  id: number;
  name: string;
  price: string;
  image: string | null;
  sku: string;
  type: ProductType;
  status: 'draft' | 'pending' | 'private' | 'publish';
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  categories: { id: number; name: string }[];
  date_created: string | null;
  permalink: string;
}

export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[];
  normalizedProductName: string;
}

export type SubmissionStatus = 'idle' | 'processing' | 'success' | 'error';

export type SubmissionStepStatus = 'pending' | 'processing' | 'success' | 'error';
export interface SubmissionStep {
  id: string;
  name: string;
  status: SubmissionStepStatus;
  progress?: number;
  error?: string;
}

export interface ActivityLog {
  id: string;
  userId: string;
  action: 'PRODUCT_CREATED' | string;
  timestamp: string; // ISO date string
  details: {
    productId?: number;
    productName?: string;
    connectionKey?: string;
    source?: string;
    [key: string]: any;
  };
  user: {
    displayName: string;
    email: string;
    photoURL: string;
  };
}

export interface UserNotification {
  id: string;
  recipientUid: string;
  type: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string; // ISO date string
}

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
  parent: number;
  lang?: string;
  translations?: Record<string, number>;
}

export interface ContentStats {
    totalPosts: number;
    totalPages: number;
    totalContent: number;
    languages: Record<string, number>;
    status: Record<string, number>;
}

export interface SeoAnalysisRecord {
    id: string;
    userId: string;
    url: string;
    createdAt: string; // ISO String
    analysis: AnalysisResult;
    score: number;
}

export interface BlogStats {
  total: number;
  status: {
    [key: string]: number;
  };
}

export interface ProductStats {
  total: number;
  status: { [key: string]: number };
  type: { [key: string]: number };
}
