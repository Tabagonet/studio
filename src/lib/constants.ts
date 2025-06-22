
import { Home, Wand2, FileText, Cog, Bell, Settings, Layers, Brain } from 'lucide-react';
import type { NavItem, ProductType, ProductData } from '@/lib/types';

export const APP_NAME = "WooAutomate";

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
    title: 'Procesamiento en Lotes',
    href: '/batch',
    icon: Layers,
  },
  {
    title: 'Gestión de Plantillas',
    href: '/templates',
    icon: FileText,
    disabled: true,
  },
  {
    title: 'Reglas de Automatización',
    href: '/rules',
    icon: Cog,
    disabled: true,
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
  name: "",
  productType: 'simple',
  regularPrice: "",
  salePrice: "",
  category: null,
  keywords: "",
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: "", value: "", forVariations: false }],
  photos: [],
  variations: [],
  language: 'Spanish',
  imageTitle: '',
  imageAltText: '',
  imageCaption: '',
  imageDescription: '',
  groupedProductIds: [],
};
