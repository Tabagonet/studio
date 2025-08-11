
// src/lib/types.ts
      
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
  requiredPlan?: ('lite' | 'pro' | 'agency')[];
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  requiredPlatform?: 'woocommerce' | 'shopify';
}

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'error';

export interface ProductPhoto {
  id: string | number;
  file?: File; // The actual file object, present only on client-side before upload
  previewUrl: string; // Used for client-side preview (object URL or existing src)
  name: string; // filename
  isPrimary?: boolean; 
  status: UploadStatus;
  progress: number;
  error?: string;
  uploadedUrl?: string;
  uploadedFilename?: string;
  serverPath?: string;
  toDelete?: boolean; 
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
  id?: number;
  name: string;
  value: string;
  options?: string[];
  forVariations?: boolean;
  visible?: boolean;
  position?: number;
  variation?: boolean;
}

export interface ProductVariationAttribute {
  name: string;
  option: string;
}

export interface ProductVariation {
  id: string; // client-side UUID
  variation_id?: number; // The actual WooCommerce variation ID, available on edit
  attributes: ProductVariationAttribute[];
  sku: string;
  regularPrice: string;
  salePrice: string;
  manage_stock: boolean;
  stockQuantity: string;
  image?: { id: number | string | null; toDelete?: boolean };
  weight?: string;
  dimensions?: {
    length?: string;
    width?: string;
    height?: string;
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
  tags: string[];
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
  id?: number;
  name: string;
  sku: string;
  status: 'publish' | 'draft' | 'pending' | 'private';
  supplier?: string | null; 
  newSupplier?: string;
  productType: ProductType;
  regularPrice: string;
  salePrice: string;
  shortDescription: string;
  longDescription: string;
  tags: string[];
  category_id?: number | null;
  category?: WooCommerceCategory | null;
  categoryPath?: string;
  photos: ProductPhoto[];
  variations?: ProductVariation[];
  attributes: ProductAttribute[];
  // Metadata for any new images being uploaded
  imageTitle?: string;
  imageAltText?: string;
  imageCaption?: string;
  imageDescription?: string;
  // Inventory and shipping
  manage_stock: boolean;
  stockQuantity: string;
  weight?: string;
  dimensions?: {
    length: string;
    width: string;
    height: string;
  };
  shipping_class: string;
  language: 'Spanish' | 'English' | 'French' | 'German' | 'Portuguese';
  shouldSaveSku?: boolean;
  groupedProductIds?: number[];
  source?: 'wizard' | 'batch';
  targetLanguages?: string[];
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
  supplier: string | null;
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
  message?: string;
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
    aiUsageCount?: number;
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
  slug: string | null;
  type: 'Post' | 'Page' | 'Producto' | 'Categoría de Entradas';
  link: string | null;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future' | 'trash';
  parent: number;
  lang?: string | null;
  translations?: Record<string, number> | null;
  modified: string | null;
  is_front_page: boolean;
  score?: number;
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
    totalContent: number;
    languages: Record<string, number>;
    status: Record<string, number>;
    totalProducts: number;
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

interface OneTimeCredit {
    amount: number;
    source: string; // e.g., "Manual Admin Add", "Bonus Pack"
    addedAt: string; // ISO Date string
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
  plan?: 'lite' | 'pro' | 'agency' | null;
  shopifyCreationDefaults?: {
    createProducts?: boolean;
    theme?: string;
  };
  aiUsageCount?: number;
  oneTimeCredits?: OneTimeCredit[];
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
  companyPlan?: 'lite' | 'pro' | 'agency' | null;
  plan?: 'lite' | 'pro' | 'agency' | null; // Individual user plan
  platform?: 'woocommerce' | 'shopify' | null;
  companyPlatform?: 'woocommerce' | 'shopify' | null;
  aiUsageCount?: number;
  oneTimeCredits?: OneTimeCredit[];
  productCount?: number; // Total products created historically
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

// New types for Plan Management
export interface Plan {
  id: 'lite' | 'pro' | 'agency';
  name: string;
  price: string;
  sites: number;
  users: number;
  aiCredits: number;
  features: Record<string, boolean>; // e.g., { '/wizard': true, '/batch': false }
}

export interface PlanUsage {
  connections: { used: number; limit: number; };
  users: { used: number; limit: number; };
  aiCredits: { 
    used: number; 
    limit: number;
    oneTimeAvailable: number;
    totalAvailable: number;
  };
}
