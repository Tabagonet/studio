import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { WordTokenizer, PorterStemmer, SentimentAnalyzer, PorterStemmerEs, BayesClassifier } from 'natural';


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- NLP Utilities using 'natural' library ---

/**
 * Tokenizes a string into an array of words (lowercase).
 * @param text The input string.
 * @returns An array of tokens.
 */
export function tokenizeText(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const tokenizer = new WordTokenizer();
  return tokenizer.tokenize(text.toLowerCase()) || [];
}

/**
 * Stems a single word using Porter Stemmer (for English).
 * @param word The word to stem.
 * @returns The stemmed word.
 */
export function stemWordEn(word: string): string {
  if (!word || typeof word !== 'string') return "";
  return PorterStemmer.stem(word.toLowerCase());
}

/**
 * Stems all words in a text string (for English).
 * @param text The input string.
 * @returns A string with all words stemmed.
 */
export function stemTextEn(text: string): string {
  if (!text || typeof text !== 'string') return "";
  const tokens = tokenizeText(text);
  return tokens.map(token => PorterStemmer.stem(token)).join(" ");
}

/**
 * Stems a single word using Porter Stemmer (for Spanish).
 * @param word The word to stem.
 * @returns The stemmed word.
 */
export function stemWordEs(word: string): string {
  if (!word || typeof word !== 'string') return "";
  return PorterStemmerEs.stem(word.toLowerCase());
}

/**
 * Stems all words in a text string (for Spanish).
 * @param text The input string.
 * @returns A string with all words stemmed.
 */
export function stemTextEs(text: string): string {
  if (!text || typeof text !== 'string') return "";
  const tokens = tokenizeText(text); // `natural` tokenizer is language-agnostic for simple splitting
  return tokens.map(token => PorterStemmerEs.stem(token)).join(" ");
}

/**
 * Gets the sentiment score of a text (for English, using AFINN lexicon by default).
 * A positive score indicates positive sentiment, negative for negative, 0 for neutral.
 * @param text The input string.
 * @returns The sentiment score.
 */
export function getSentimentEn(text: string): number {
  if (!text || typeof text !== 'string') return 0;
  const tokenizer = new WordTokenizer();
  const tokens = tokenizer.tokenize(text.toLowerCase());
  if (!tokens || tokens.length === 0) return 0;

  // Uses PorterStemmer and AFINN lexicon by default for English
  const analyzer = new SentimentAnalyzer("English", PorterStemmer, "afinn");
  return analyzer.getSentiment(tokens);
}

/**
 * Creates and trains a simple BayesClassifier for demonstration.
 * In a real application, you'd train with much more data and persist/load the classifier.
 * @returns A trained BayesClassifier instance.
 */
export function getExampleClassifier(): BayesClassifier {
    const classifier = new BayesClassifier();
    classifier.addDocument('great product amazing quality', 'positive');
    classifier.addDocument('love this item buy it now', 'positive');
    classifier.addDocument('excellent customer service', 'positive');
    classifier.addDocument('terrible product bad experience awful', 'negative');
    classifier.addDocument('hate it do not recommend this', 'negative');
    classifier.addDocument('poor quality waste of money', 'negative');
    classifier.addDocument('this is a neutral review of the item', 'neutral');
    
    // Check if the classifier has enough data to train for all labels
    try {
        classifier.train();
    } catch (e) {
        console.warn("Error training example classifier (likely insufficient data for all labels):", e);
        // Add more generic documents if training fails, to ensure it can always be constructed
        if (!classifier.docs.some(doc => doc.label === 'positive')) classifier.addDocument('positive example', 'positive');
        if (!classifier.docs.some(doc => doc.label === 'negative')) classifier.addDocument('negative example', 'negative');
        if (!classifier.docs.some(doc => doc.label === 'neutral')) classifier.addDocument('neutral example', 'neutral');
        try {
            classifier.train(); // Retry training
        } catch (e2) {
            console.error("Could not train example classifier even with fallbacks:", e2);
        }
    }
    return classifier;
}

/*
// Example usage of the utilities:
// console.log("Tokenized:", tokenizeText("This is an example sentence."));
// console.log("Stemmed (En):", stemTextEn("Running and beautifully"));
// console.log("Stemmed (Es):", stemTextEs("Corriendo y hermosamente"));
// console.log("Sentiment (En):", getSentimentEn("This is a wonderful product!")); // positive
// console.log("Sentiment (En):", getSentimentEn("This is a terrible product.")); // negative

// const myClassifier = getExampleClassifier();
// if (myClassifier.trained) { // Check if classifier was successfully trained
//   console.log("Classification ('great deal'):", myClassifier.classify('this is a great deal'));
//   console.log("Classification ('awful product'):", myClassifier.classify('this is an awful product'));
// } else {
//   console.log("Example classifier not trained, cannot classify.");
// }
*/
