
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { WordTokenizer, PorterStemmer, SentimentAnalyzer, PorterStemmerEs, BayesClassifier } from 'natural';
import type { ParsedNameData } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- NLP Utilities using 'natural' library ---

export function tokenizeText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const tokenizer = new WordTokenizer();
  return tokenizer.tokenize(text.toLowerCase()) || [];
}

export function stemWordEn(word: string): string {
  if (!word || typeof word !== 'string') return "";
  return PorterStemmer.stem(word.toLowerCase());
}

export function stemTextEn(text: string): string {
  if (!text || typeof text !== 'string') return "";
  const tokens = tokenizeText(text);
  return tokens.map(token => PorterStemmer.stem(token)).join(" ");
}

export function stemWordEs(word: string): string {
  if (!word || typeof word !== 'string') return "";
  return PorterStemmerEs.stem(word.toLowerCase());
}

export function stemTextEs(text: string): string {
  if (!text || typeof text !== 'string') return "";
  const tokens = tokenizeText(text);
  return tokens.map(token => PorterStemmerEs.stem(token)).join(" ");
}

export function getSentimentEn(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  if (!tokens || tokens.length === 0) return 0;
  const analyzer = new SentimentAnalyzer("English", PorterStemmer, "afinn");
  return analyzer.getSentiment(tokens);
}

export function getExampleClassifier(): BayesClassifier {
    const classifier = new BayesClassifier();
    classifier.addDocument('great product amazing quality', 'positive');
    classifier.addDocument('love this item buy it now', 'positive');
    classifier.addDocument('excellent customer service', 'positive');
    classifier.addDocument('terrible product bad experience awful', 'negative');
    classifier.addDocument('hate it do not recommend this', 'negative');
    classifier.addDocument('poor quality waste of money', 'negative');
    classifier.addDocument('this is a neutral review of the item', 'neutral');
    try {
        classifier.train();
    } catch (e) {
        console.warn("Error training example classifier:", e);
        if (!classifier.docs.some(doc => doc.label === 'positive')) classifier.addDocument('positive example', 'positive');
        if (!classifier.docs.some(doc => doc.label === 'negative')) classifier.addDocument('negative example', 'negative');
        if (!classifier.docs.some(doc => doc.label === 'neutral')) classifier.addDocument('neutral example', 'neutral');
        try { classifier.train(); } catch (e2) { console.error("Could not train example classifier:", e2); }
    }
    return classifier;
}

/**
 * Extracts product name and potential attributes from a filename.
 * Example: "AGAVE CAVANILLESII-1.jpg" -> name: "Agave Cavanillesii", attributes: ["1"]
 * Example: "My Product_Blue_Large-002.png" -> name: "My Product Blue Large", attributes: ["002"]
 * This is a basic implementation and can be significantly improved.
 * @param originalFilename The original filename.
 * @param contextName Optional name from product context, if available, to refine extraction.
 * @returns ParsedNameData object.
 */
export function extractProductNameAndAttributesFromFilename(
  originalFilename: string,
  contextName?: string
): ParsedNameData {
  if (!originalFilename) {
    return {
      extractedProductName: 'Unknown Product',
      potentialAttributes: [],
      normalizedProductName: 'unknownproduct',
    };
  }

  // Prefer contextName if provided and seems more complete
  let namePart = contextName || originalFilename;
  
  // Remove extension
  namePart = namePart.substring(0, namePart.lastIndexOf('.')) || namePart;

  // Attempt to split by common delimiters for attributes/numbering
  const parts = namePart.split(/[-_](?=\d+$)|[-_](?=[cC]opy\d*$)|[-_](?=[vV]ariation\d*$)/);
  let extractedProductName = parts[0];
  const potentialAttributes: string[] = parts.slice(1).map(p => p.trim()).filter(p => p);

  // Further refine product name if it was from filename
  if (!contextName) {
      // Replace hyphens/underscores with spaces, then capitalize words
      extractedProductName = extractedProductName
        .replace(/[-_]/g, ' ')
        .trim()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
  } else {
      // If contextName was used, assume it's already well-formatted
      extractedProductName = contextName.trim();
  }


  // If no attributes extracted from suffix, and namePart had internal delimiters,
  // try to see if those were intended as part of the name vs attributes
  if (potentialAttributes.length === 0 && !contextName) {
    const subParts = extractedProductName.split(' ');
    if (subParts.length > 1) {
        const lastPart = subParts[subParts.length - 1];
        // If last part is a number or common variation indicator, consider it an attribute
        if (/^\d+$/.test(lastPart) || /^[mMlLxX]+[sS]?$/.test(lastPart) /* S, M, L, XL, XXL etc */) {
            // This logic can be much more sophisticated
            // For now, let's assume if contextName wasn't given, such parts were for numbering/variation.
        }
    }
  }
  
  // Normalize for use in prompts or as keywords
  const normalizedProductName = extractedProductName
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize multiple spaces
    .trim();

  return {
    extractedProductName: extractedProductName.trim() || 'Unnamed Product',
    potentialAttributes,
    normalizedProductName,
  };
}
