import { Home, Wand2, FileText, Cog, Bell, Settings, ShoppingBag, PackagePlus, ListChecks, Tags } from 'lucide-react';
import type { NavItem } from '@/lib/types';

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
