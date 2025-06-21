import type { LucideIcon } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';

// Core navigation type, kept for UI layout
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  label?: string;
  disabled?: boolean;
  external?: boolean;
}

// Minimal types to support Firebase auth and basic UI components
export interface ProductPhoto {
  id: string;
  file: File;
  previewUrl: string;
  name: string;
  isPrimary?: boolean;
  localPath?: string;
}

export interface ProductAttribute {
  name: string;
  value: string;
}

export type ProductType = 'simple' | 'variable' | 'grouped';

export interface WooCommerceCategory {
    id: number;
    name: string;
    slug: string;
}

// Other complex types have been removed for the project reset.
// They will be re-introduced as features are rebuilt.
