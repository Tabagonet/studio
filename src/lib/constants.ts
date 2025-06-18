
import { Home, Wand2, FileText, Cog, Bell, Settings, ShoppingBag, PackagePlus, ListChecks, Tags, Layers } from 'lucide-react';
import type { NavItem, TemplateType, TemplateScope } from '@/lib/types';

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
    icon: Cog, // Using Cog icon for rules
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

export const PRODUCT_CATEGORIES = [
  { value: "ropa", label: "Ropa" },
  { value: "electronica", label: "Electrónica" },
  { value: "hogar", label: "Hogar y Jardín" },
  { value: "accesorios", label: "Accesorios" },
  { value: "deportes", label: "Deportes" },
  { value: "sin_categoria", label: "Sin Categoría" }, // Added an option for no category
];

export const INITIAL_PRODUCT_DATA = {
  sku: "",
  name: "",
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

// Firestore collection name for product templates
export const PRODUCT_TEMPLATES_COLLECTION = "product_templates";

// Firestore collection name for automation rules
export const AUTOMATION_RULES_COLLECTION = "automation_rules";
