
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ParsedNameData } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}


/**
 * Extracts product name and potential attributes from a filename.
 * Example: "FOV1-AMPOLLAS_ANTICAIDA_ADENOSINA-1.png" -> 
 * sku: "FOV1", name: "AMPOLLAS ANTICAIDA ADENOSINA"
 * @param originalFilename The original filename.
 * @returns ParsedNameData object.
 */
export function extractProductNameAndAttributesFromFilename(
  originalFilename: string
): ParsedNameData {
  if (!originalFilename) {
    return {
      extractedProductName: '',
      potentialAttributes: [],
      normalizedProductName: '',
      sku: '',
    };
  }

  const nameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.'));
  const firstHyphenIndex = nameWithoutExt.indexOf('-');
  const lastHyphenIndex = nameWithoutExt.lastIndexOf('-');

  // Handle cases with no hyphens or only one hyphen (e.g., "SKU.jpg", "SKU-1.jpg")
  if (firstHyphenIndex === -1 || firstHyphenIndex === lastHyphenIndex) {
    const parts = nameWithoutExt.split('-');
    const sku = parts[0] || '';
    const potentialAttribute = parts[1] || '';
    return {
      extractedProductName: sku, // Fallback to SKU as name
      potentialAttributes: potentialAttribute ? [potentialAttribute] : [],
      sku: sku,
      normalizedProductName: sku.toLowerCase(),
    };
  }

  // Standard case: SKU-NAME-NUMBER.ext
  const sku = nameWithoutExt.substring(0, firstHyphenIndex).trim();
  const productNameWithUnderscores = nameWithoutExt.substring(firstHyphenIndex + 1, lastHyphenIndex).trim();
  const photoNumber = nameWithoutExt.substring(lastHyphenIndex + 1).trim();

  const extractedProductName = productNameWithUnderscores.replace(/_/g, ' ').trim();
  
  return {
    extractedProductName: extractedProductName,
    potentialAttributes: [photoNumber],
    sku: sku,
    normalizedProductName: extractedProductName.toLowerCase().replace(/\s+/g, ' ').trim(),
  };
}
