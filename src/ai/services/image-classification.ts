
'use server';
/**
 * @fileOverview Image classification services using TensorFlow.js and MobileNet.
 * - classifyImage - Classifies an image buffer and returns potential labels.
 */
import * as tf from '@tensorflow/tfjs-node';
import * as mobilenet from '@tensorflow-models/mobilenet';

let model: mobilenet.MobileNet | null = null;

async function loadMobileNetModel(): Promise<mobilenet.MobileNet> {
  if (model) {
    return model;
  }
  console.log('[MobileNet] Loading model V2...');
  // Load MobileNetV2, alpha 1.0
  model = await mobilenet.load({ version: 2, alpha: 1.0 });
  console.log('[MobileNet] Model V2 loaded successfully.');
  return model;
}

export interface ClassificationResult {
  className: string;
  probability: number;
}

/**
 * Classifies an image buffer using MobileNetV2.
 * @param imageBuffer Buffer of the image (JPEG or PNG).
 * @returns A promise that resolves to an array of classification results.
 * @throws Error if classification fails.
 */
export async function classifyImage(imageBuffer: Buffer): Promise<ClassificationResult[]> {
  try {
    const loadedModel = await loadMobileNetModel();
    
    // Decode the image buffer to a tf.Tensor3D
    // tf.node.decodeImage supports JPEG, PNG, BMP, GIF.
    // It requires a Uint8Array or Buffer as input.
    const imageTensor = tf.node.decodeImage(imageBuffer, 3) as tf.Tensor3D;
    
    console.log('[MobileNet] Classifying image...');
    const predictions = await loadedModel.classify(imageTensor);
    
    imageTensor.dispose(); // Dispose of the tensor to free memory

    console.log('[MobileNet] Classification complete (top 3):', predictions.slice(0,3));
    return predictions;
  } catch (error) {
    console.error('[MobileNet] Error during image classification:', error);
    // Optionally, dispose model if it's in a bad state or causing persistent errors
    // A more robust solution might involve a retry mechanism or checking model state.
    // For now, we'll let it try to reload on next call if an error occurs here.
    // model = null; 
    throw new Error('Failed to classify image with MobileNet.');
  }
}

// Example of how this might be called (e.g., from process-photos API route or a server action):
/*
import { classifyImage } from '@/ai/services/image-classification';
// Assuming 'downloadedImageBuffer' is a Buffer from a downloaded JPEG/PNG image.

async function processMyImage(downloadedImageBuffer: Buffer) {
  try {
    const labels = await classifyImage(downloadedImageBuffer);
    
    // Use labels, e.g., add top N labels to product keywords
    const keywordsFromLabels = labels
      .slice(0, 3) // Take top 3 predictions
      .map(l => l.className.toLowerCase().split(',')[0].trim()) // Take first part of class name, trim
      .filter(k => k.length > 2) // Filter out very short keywords
      .join(', ');

    console.log('Keywords from MobileNet:', keywordsFromLabels);
    // Now you can use 'keywordsFromLabels'
  } catch (classificationError) {
    console.warn('Could not classify image:', classificationError);
  }
}
*/
