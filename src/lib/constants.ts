
import { Home, Wand2, FileText, Cog, Bell, Settings, Layers, Brain, UploadCloud, Users, LineChart, Newspaper } from 'lucide-react';
import type { NavItem, ProductType, ProductData, BlogPostData } from '@/lib/types';

export const APP_NAME = "WooAutomate";
export const SUPPORT_EMAIL = "intelvisual@intelvisual.es";

export const NAV_ITEMS: NavItem[] = [
  {
    title: 'Panel de Control',
    href: '/dashboard',
    icon: Home,
  },
  {
    title: 'Asistente de Creación',
    href: '/wizard',
    icon: Wand2,
  },
  {
    title: 'Creador de Entradas',
    href: '/blog-creator',
    icon: Newspaper,
  },
  {
    title: 'Gestión de Productos',
    href: '/batch',
    icon: Layers,
  },
  {
    title: 'Proceso en Lotes',
    href: '/batch-process',
    icon: UploadCloud,
    disabled: false,
  },
  {
    title: 'Gestión de Prompts IA',
    href: '/prompts',
    icon: Brain,
    disabled: false,
  },
  {
    title: 'Notificaciones',
    href: '/notifications',
    icon: Bell,
  },
  {
    title: 'Gestión de Usuarios',
    href: '/admin/users',
    icon: Users,
    adminOnly: true,
  },
  {
    title: 'Actividad de Usuarios',
    href: '/admin/activity',
    icon: LineChart,
    adminOnly: true,
  },
  {
    title: 'Configuración',
    href: '/settings',
    icon: Settings,
  },
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
  category: null,
  keywords: "",
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: "", value: "", forVariations: false, visible: true }],
  photos: [],
  variations: [],
  language: 'Spanish',
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
  category: null,
  status: 'draft',
  featuredImage: null,
  sourceLanguage: 'Spanish',
  targetLanguages: [],
  author: null,
  publishDate: null,
};
