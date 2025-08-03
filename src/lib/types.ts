

import type { LucideIcon } from 'lucide-react';
import type { SeoInterpretationOutput, SuggestLinksInput, SuggestLinksOutput, LinkSuggestion } from '@/ai/schemas';

// Core navigation type, kept for UI layout
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon | React.ComponentType<any>;
  label?: string;
  disabled?: boolean;
  external?: boolean;
  requiredRoles?: string[];
  requiresCompany?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  requiredPlatform?: 'woocommerce' | 'shopify';
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
  manage_stock: boolean;
  stockQuantity: string;
  weight?: string;
  dimensions?: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class?: string;
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
  status: 'publish' | 'draft' | 'pending' | 'future' | 'private' | 'trash';
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
  manage_stock: boolean;
  stockQuantity: string;
  weight?: string;
  dimensions?: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
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
  regular_price: string;
  sale_price: string;
  image: string | null;
  sku: string;
  type: ProductType;
  status: 'draft' | 'pending' | 'private' | 'publish' | 'trash';
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  categories: { id: number; name: string }[];
  date_created: string | null;
  permalink: string;
  lang?: string;
  translations?: Record<string, number>;
  manage_stock: boolean;
  stock_quantity: number | null;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
}

export type HierarchicalProduct = ProductSearchResult & { subRows: HierarchicalProduct[] };

export interface ParsedNameData {
  extractedProductName: string;
  potentialAttributes: string[];
  normalizedProductName: string;
  sku?: string;
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
    companyId?: string | null;
    companyName?: string | null;
    platform?: 'woocommerce' | 'shopify' | null;
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
  createdAt: string;
}

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page' | 'Producto' | 'Categoría de Entradas' | 'Categoría de Productos';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future' | 'trash';
  parent: number;
  lang?: string | null;
  translations?: Record<string, number> | null;
  modified: string | null;
  score?: number;
  is_front_page?: boolean;
}

export type HierarchicalContentItem = ContentItem & {
    subRows?: HierarchicalContentItem[];
};


export interface ContentImage {
    id: string; // The original `src` attribute, used as a unique key
    src: string; // The display-ready, absolute URL
    alt: string;
    mediaId: number | null; // The WordPress Media Library ID
    width: number | null;
    height: number | null;
}

export interface ExtractedWidget {
    id: string;
    type: 'heading' | 'text-editor' | 'other';
    tag?: string; // h1, h2, p, etc.
    text: string;
}

export interface ContentStats {
    totalPosts: number;
    totalPages: number;
    totalProducts: number;
    totalContent: number;
    languages: Record<string, number>;
    status: Record<string, number>;
}

export interface AnalysisResult {
  title: string;
  metaDescription: string;
  canonicalUrl: string;
  h1: string;
  headings: { tag: string; text: string }[];
  images: { src: string; alt: string }[];
  aiAnalysis: {
    score: number;
    checks: {
        titleContainsKeyword: boolean;
        titleIsGoodLength: boolean;
        metaDescriptionContainsKeyword: boolean;
        metaDescriptionIsGoodLength: boolean;
        keywordInFirstParagraph: boolean;
        contentHasImages: boolean;
        allImagesHaveAltText: boolean;
        h1Exists: boolean;
        canonicalUrlExists: boolean;
    };
    suggested: {
      title: string;
      metaDescription: string;
      focusKeyword: string;
    };
  };
}


export interface SeoAnalysisRecord {
    id: string;
    userId: string;
    url: string;
    createdAt: string; // ISO String
    analysis: AnalysisResult;
    score: number;
    interpretation?: SeoInterpretationOutput;
}

export type { SeoInterpretationOutput, SuggestLinksInput, SuggestLinksOutput, LinkSuggestion };

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

export interface Company {
  id: string;
  name: string;
  createdAt: string; // ISO String
  userCount?: number;
  logoUrl?: string | null;
  taxId?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  seoHourlyRate?: number;
  platform?: 'woocommerce' | 'shopify';
  shopifyCreationDefaults?: {
    createProducts?: boolean;
    theme?: string;
  };
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: string;
  status: 'active' | 'rejected' | 'pending_approval';
  siteLimit: number;
  companyId: string | null;
  companyName: string | null;
  platform?: 'woocommerce' | 'shopify' | null;
}

export interface Prospect {
  id: string;
  name: string;
  email: string;
  companyUrl: string;
  status: 'new' | 'contacted' | 'converted' | 'archived';
  createdAt: string; // ISO String
  source: string;
  inquiryData?: {
    objective?: string;
    businessDescription?: string;
    valueProposition?: string;
    targetAudience?: string;
    competitors?: string;
    brandPersonality?: string;
    monthlyBudget?: string;
  };
}

export interface ShopifyCreationJob {
  id: string;
  status: 'pending' | 'assigned' | 'awaiting_auth' | 'authorized' | 'populating' | 'completed' | 'error';
  createdAt: string; // ISO String
  updatedAt: string; // ISO String
  logs: { timestamp: string, message: string }[];
  
  // Data from the initial request
  webhookUrl: string;
  storeName: string;
  businessEmail: string;
  brandDescription: string;
  targetAudience: string;
  brandPersonality: string;
  colorPaletteSuggestion?: string;
  productTypeDescription: string;
  creationOptions: {
    createExampleProducts: boolean;
    numberOfProducts?: number;
    createAboutPage: boolean;
    createContactPage: boolean;
    createLegalPages: boolean;
    createBlogWithPosts: boolean;
    numberOfBlogPosts?: number;
    setupBasicNav: boolean;
    theme?: string;
  };
  legalInfo: {
    legalBusinessName: string;
    businessAddress: string;
  };
  entity: {
      type: 'user' | 'company';
      id: string;
  };
  
  // Data added after assignment
  shopId?: string; 
  storeDomain?: string;
  installUrl?: string; // The URL to authorize the app
  
  // Data added after authorization
  storeAccessToken?: string;

  // Data added on completion
  createdStoreAdminUrl?: string;
}
