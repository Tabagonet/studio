

import { Home, Wand2, Settings, Layers, Brain, UploadCloud, Users, LineChart, Newspaper, Bell, ClipboardList, SearchCheck, Copy, Building, Megaphone, Briefcase, Store, ListChecks, Lightbulb, FileText, Shield, Sparkles } from 'lucide-react';
import type { NavItem, ProductType, ProductData, BlogPostData, NavGroup } from '@/lib/types';
import { ShopifyIcon } from '@/components/core/icons';

export const APP_NAME = "AutoPress AI";
export const SUPPORT_EMAIL = "intelvisual@intelvisual.es";

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [
      { title: 'Panel de Control', href: '/dashboard', icon: Home },
      { title: 'Notificaciones', href: '/notifications', icon: Bell },
    ]
  },
  {
    title: 'WooCommerce',
    requiredPlatform: 'woocommerce',
    items: [
      { title: 'Asistente de Creación', href: '/wizard', icon: Wand2, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['pro', 'agency'] },
      { title: 'Gestión de Productos', href: '/batch', icon: Layers, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
      { title: 'Proceso en Lotes', href: '/batch-process', icon: UploadCloud, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['agency'] },
    ]
  },
   {
    title: 'Shopify',
    requiredPlatform: 'shopify',
    items: [
      { title: 'Trabajos de Creación', href: '/shopify/jobs', icon: ListChecks, requiredRoles: ['admin', 'super_admin'], requiredPlan: ['agency'] },
    ]
  },
  {
    title: 'Blog y Páginas',
    requiredPlatform: 'woocommerce',
    items: [
       { title: 'Creador de Entradas', href: '/blog-creator', icon: Newspaper, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['pro', 'agency'] },
       { title: 'Gestión de Entradas', href: '/blog', icon: ClipboardList, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
       { title: 'Gestión de Páginas', href: '/pages', icon: FileText, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
    ]
  },
  {
    title: 'Herramientas',
    items: [
       { title: 'Estrategia de Contenidos', href: '/content-strategy', icon: Lightbulb, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Planificador de Publicidad', href: '/ad-planner', icon: Megaphone, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Optimizador SEO', href: '/seo-optimizer', icon: SearchCheck, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Clonador de Contenido', href: '/content-cloner', icon: Copy, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Clonador de Menús', href: '/menu-cloner', icon: Copy, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
    ]
  },
   {
    title: 'Captación',
    items: [
      { title: 'Prospectos', href: '/prospects', icon: Briefcase, requiredRoles: ['super_admin'], requiredPlan: ['pro', 'agency'] },
    ]
  },
   {
    title: 'Ajustes',
    items: [
       { title: 'Mi Plan y Facturación', href: '/settings/my-plan', icon: Sparkles, requiredRoles: ['admin', 'super_admin'] },
       { title: 'Datos de Cuenta', href: '/settings/company', icon: Building, requiredRoles: ['admin', 'super_admin'] },
       { title: 'Gestión de Prompts IA', href: '/prompts', icon: Brain, requiredRoles: ['super_admin'] },
       { title: 'Configuración', href: '/settings', icon: Settings, requiredRoles: ['admin', 'super_admin'] },
    ]
  },
  {
    title: 'Administración',
    items: [
      { title: 'Gestión de Planes', href: '/admin/plans', icon: Shield, requiredRoles: ['super_admin'] },
      { title: 'Gestión de Empresas', href: '/admin/companies', icon: Building, requiredRoles: ['super_admin'] },
      { title: 'Gestión de Usuarios', href: '/admin/users', icon: Users, requiredRoles: ['admin', 'super_admin'], requiresCompany: true },
      { title: 'Actividad de Usuarios', href: '/admin/activity', icon: LineChart, requiredRoles: ['admin', 'super_admin'] },
    ]
  }
];


export const WIZARD_STEPS = [
  { id: '01', name: 'Detalles y Fotos', description: 'Información básica y carga de imágenes.' },
  { id: '02', name: 'Vista Previa', description: 'Revisa y edita el producto.' },
  { id: '03', name: 'Confirmación', description: 'Finaliza y procesa.' },
];


export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'simple', label: 'Producto Simple' },
  { value: 'variable', label: 'Producto Variable' },
  { value: 'grouped', label: 'Producto Agrupado' },
];

export const INITIAL_PRODUCT_DATA: ProductData = {
  sku: "",
  shouldSaveSku: true,
  name: "",
  productType: 'simple',
  regularPrice: "",
  salePrice: "",
  manage_stock: false,
  stockQuantity: "",
  weight: "",
  dimensions: {
    length: "",
    width: "",
    height: ""
  },
  shipping_class: "",
  category: null,
  tags: "",
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: '', value: '', forVariations: false, visible: true }],
  photos: [],
  variations: [],
  language: 'Spanish',
  targetLanguages: [],
  imageTitle: '',
  imageAltText: '',
  imageCaption: '',
  imageDescription: '',
  groupedProductIds: [],
  source: 'wizard',
};

export const INITIAL_BLOG_DATA: BlogPostData = {
  title: '',
  content: '',
  topic: '', // for AI
  tags: '',
  focusKeyword: '',
  metaDescription: '',
  category: null,
  status: 'draft',
  featuredImage: null,
  sourceLanguage: 'Spanish',
  targetLanguages: [],
  author: null,
  publishDate: null,
};

export const ALL_LANGUAGES = [
    { code: 'Spanish', name: 'Español', slug: 'es' },
    { code: 'English', name: 'Inglés', slug: 'en' },
    { code: 'French', name: 'Francés', slug: 'fr' },
    { code: 'German', name: 'Alemán', slug: 'de' },
    { code: 'Portuguese', name: 'Portugués', slug: 'pt' },
];

export const AI_CREDIT_COSTS: { name: string; href: string, credits: number }[] = [
  { name: 'Asistente de Creación de Productos', href: '/wizard', credits: 10 },
  { name: 'Asistente de Creación de Entradas', href: '/blog-creator', credits: 10 },
  { name: 'IA en Gestión de Productos', href: '/batch', credits: 2 },
  { name: 'IA en Gestión del Blog', href: '/blog', credits: 2 },
  { name: 'IA en Gestión de Páginas', href: '/pages', credits: 2 },
  { name: 'Estrategia de Contenidos', href: '/content-strategy', credits: 5 },
  { name: 'Planificador de Publicidad', href: '/ad-planner', credits: 5 },
  { name: 'Generador de Creatividades', href: '/ad-planner', credits: 2 },
  { name: 'Generador de Tareas de Marketing', href: '/ad-planner', credits: 2 },
  { name: 'Análisis de Competencia', href: '/ad-planner', credits: 5 },
  { name: 'Estructura de Campaña de Google Ads', href: '/ad-planner', credits: 10 },
  { name: 'Optimizador SEO (Análisis Técnico)', href: '/seo-optimizer', credits: 1 },
];
