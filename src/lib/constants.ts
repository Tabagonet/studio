
import { Home, Wand2, FileText, Cog, Bell, Settings, ShoppingBag, PackagePlus, ListChecks, Tags, Layers, Brain } from 'lucide-react';
import type { NavItem, TemplateType, TemplateScope, ProductType } from '@/lib/types';

export const APP_NAME = "WooAutomate";

export const NAV_ITEMS: NavItem[] = [
  {
    title: 'Panel de Control',
    href: '/', 
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
  },
  {
    title: 'Reglas de Automatización',
    href: '/rules',
    icon: Cog, 
  },
  {
    title: 'Gestión de Prompts IA', // Nueva página
    href: '/prompts',
    icon: Brain, 
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
  { value: 'simple', label: 'Producto Simple (Físico)' },
  { value: 'variable', label: 'Producto Variable' },
  { value: 'grouped', label: 'Producto Agrupado' },
];

export const INITIAL_PRODUCT_DATA = {
  sku: "",
  name: "",
  productType: 'simple' as ProductType, 
  regularPrice: "",
  salePrice: "",
  category: "", 
  keywords: "",
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: "", value: "" }],
  photos: [],
};

export const TEMPLATE_TYPES: { value: TemplateType; label: string }[] = [
  { value: 'nombre_seo', label: 'Nombre SEO Producto' },
  { value: 'descripcion_corta', label: 'Descripción Corta SEO' },
  { value: 'descripcion_larga', label: 'Descripción Larga SEO' },
  { value: 'metadatos_seo', label: 'Metadatos SEO (Meta Título/Descripción)' },
];

export const TEMPLATE_SCOPES: { value: TemplateScope; label: string }[] = [
  { value: 'global', label: 'Global (Todos los productos)' },
  { value: 'categoria_especifica', label: 'Categoría Específica' },
];

export const PRODUCT_TEMPLATES_COLLECTION = "product_templates";
export const AUTOMATION_RULES_COLLECTION = "automation_rules";
export const APP_NOTIFICATIONS_COLLECTION = "app_notifications";
export const SEO_HISTORY_COLLECTION = "seo_history"; 
export const AI_PROMPTS_COLLECTION = "ai_prompts"; // Nueva colección para prompts
