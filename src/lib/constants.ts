

import { Home, Wand2, Settings, Layers, Brain, UploadCloud, Users, LineChart, Newspaper, Bell, ClipboardList, SearchCheck, Copy, Building, Megaphone, Briefcase } from 'lucide-react';
import type { NavItem, ProductType, ProductData, BlogPostData, NavGroup } from '@/lib/types';

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
    items: [
      { title: 'Asistente de Creación', href: '/wizard', icon: Wand2, requiredRoles: ['admin', 'super_admin', 'product_manager'] },
      { title: 'Gestión de Productos', href: '/batch', icon: Layers, requiredRoles: ['admin', 'super_admin', 'product_manager'] },
      { title: 'Proceso en Lotes', href: '/batch-process', icon: UploadCloud, requiredRoles: ['admin', 'super_admin', 'product_manager'] },
    ]
  },
  {
    title: 'Blog',
    items: [
       { title: 'Creador de Entradas', href: '/blog-creator', icon: Newspaper, requiredRoles: ['admin', 'super_admin', 'content_manager'] },
       { title: 'Gestión de Entradas', href: '/blog', icon: ClipboardList, requiredRoles: ['admin', 'super_admin', 'content_manager'] },
    ]
  },
  {
    title: 'Herramientas',
    items: [
       { title: 'Planificador de Publicidad', href: '/ad-planner', icon: Megaphone, requiredRoles: ['super_admin'] },
       { title: 'Optimizador SEO', href: '/seo-optimizer', icon: SearchCheck, requiredRoles: ['admin', 'super_admin', 'content_manager', 'product_manager', 'seo_analyst'] },
       { title: 'Clonador de Contenido', href: '/content-cloner', icon: Copy, requiredRoles: ['admin', 'super_admin', 'content_manager', 'product_manager'] },
    ]
  },
   {
    title: 'Captación',
    items: [
      { title: 'Prospectos', href: '/prospects', icon: Briefcase, requiredRoles: ['admin', 'super_admin'] },
    ]
  },
   {
    title: 'Ajustes',
    items: [
       { title: 'Datos de Empresa', href: '/settings/company', icon: Building, requiredRoles: ['admin', 'super_admin'] },
       { title: 'Gestión de Prompts IA', href: '/prompts', icon: Brain, requiredRoles: ['super_admin'] },
       { title: 'Configuración', href: '/settings', icon: Settings, requiredRoles: ['admin', 'super_admin'] },
    ]
  },
  {
    title: 'Administración',
    items: [
      { title: 'Gestión de Empresas', href: '/admin/companies', icon: Building, requiredRoles: ['super_admin'] },
      { title: 'Gestión de Usuarios', href: '/admin/users', icon: Users, requiredRoles: ['admin', 'super_admin'] },
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
  keywords: "",
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
  topic: '',
  keywords: '',
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
