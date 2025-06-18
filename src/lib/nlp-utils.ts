
'use server'; // Mark this module as server-only

import { WordTokenizer, PorterStemmer, SentimentAnalyzer, PorterStemmerEs, BayesClassifier } from 'natural';

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
