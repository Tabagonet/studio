
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import FormData from 'form-data';

// Helper to create a URL-friendly slug
const slugify = (text: string) => {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w-]+/g, '')       // Remove all non-word chars
        .replace(/--+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

// Helper function to update image metadata in WordPress after creation
async function updateImageMetadata(createdProduct: any, productData: ProductData) {
    const wooUrl = process.env.WOOCOMMERCE_STORE_URL;
    const consumerKey = process.env.WOOCOMMERCE_API_KEY;
    const consumerSecret = process.env.WOOCOMMERCE_API_SECRET;

    if (!wooUrl || !consumerKey || !consumerSecret) {
        console.warn('[WooAutomate] Cannot update image metadata: WooCommerce credentials not fully configured.');
        return;
    }

    for (const image of createdProduct.images) {
        try {
            const metadataPayload: { title?: string; alt_text?: string; caption?: string; description?: string } = {};

            if (productData.name) {
              metadataPayload.title = productData.name;
              metadataPayload.alt_text = productData.name;
            }
            if (productData.shortDescription) {
              metadataPayload.caption = productData.shortDescription;
            }
            if (productData.longDescription) {
              metadataPayload.description = productData.longDescription;
            }
            
            if (Object.keys(metadataPayload).length === 0) continue;

            const mediaUpdateUrl = `${wooUrl}/wp-json/wp/v2/media/${image.id}`;
            
            await axios.post(mediaUpdateUrl, metadataPayload, {
                auth: { username: consumerKey, password: consumerSecret },
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`[WooAutomate] Successfully updated metadata for image ID: ${image.id}`);
        } catch (metaError: any) {
            console.warn(`[WooAutomate] Warning: Could not update metadata for image ID: ${image.id}. Error:`, metaError.message);
        }
    }
}

// Helper to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData, imageUrls: { src: string }[]) => {
  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value)
    .map(attr => ({
      name: attr.name,
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      variation: data.productType === 'variable'
    }));
  
  const wooTags = data.keywords ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) : [];
  const wooImages = imageUrls.map((img, index) => ({ src: img.src, position: index }));

  return {
    name: data.name,
    sku: data.sku || undefined,
    type: data.productType,
    regular_price: data.regularPrice,
    sale_price: data.salePrice || undefined,
    description: data.longDescription,
    short_description: data.shortDescription,
    categories: data.category ? [{ id: data.category.id }] : [],
    images: wooImages,
    attributes: wooAttributes,
    tags: wooTags,
  };
};

// Fire-and-forget helper to delete images from the external host
function deleteImagesFromExternalHost(urls: { src: string }[]) {
    if (urls.length === 0) return;
    const QUEFOTO_DELETE_API_URL = 'https://quefoto.es/api/delete'; // Assumed delete endpoint

    console.log(`[WooAutomate] Starting background deletion of ${urls.length} images from quefoto.es.`);
    
    // We don't await this loop, letting it run in the background.
    for (const url of urls) {
        axios.post(QUEFOTO_DELETE_API_URL, { imageUrl: url.src })
            .then(() => console.log(`[WooAutomate] Successfully requested deletion for: ${url.src}`))
            .catch(error => console.warn(`[WooAutomate] Failed to request deletion for ${url.src}:`, error.message));
    }
}


export async function POST(request: NextRequest) {
  // 1. Authenticate the user
  const token = request.headers.get('Authorization')?.split('Bearer ')[1];
  if (!token) {
    return NextResponse.json({ success: false, error: 'Authentication token not provided.' }, { status: 401 });
  }
  try {
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Error verifying Firebase token:", error);
    return NextResponse.json({ success: false, error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  const uploadedImageUrls: { src: string }[] = [];
  const QUEFOTO_UPLOAD_API_URL = 'https://quefoto.es/api/upload';

  // 3. Process and upload images to external host
  if (productData.photos && productData.photos.length > 0) {
    const sortedPhotos = [...productData.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

    for (const photo of sortedPhotos) {
      if (!photo.dataUri) continue;

      try {
        const base64EncodedImageString = photo.dataUri.split(',')[1];
        if (!base64EncodedImageString) throw new Error('Invalid data URI provided.');

        const imageBuffer = Buffer.from(base64EncodedImageString, 'base64');
        
        const processedBuffer = await sharp(imageBuffer)
            .resize(1000, 1000, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();

        const seoFilename = `${slugify(productData.name || 'product')}-${uuidv4()}.webp`;
        
        const formData = new FormData();
        formData.append('file', processedBuffer, { filename: seoFilename, contentType: 'image/webp' });

        const uploadResponse = await axios.post(QUEFOTO_UPLOAD_API_URL, formData, {
            headers: { ...formData.getHeaders() },
        });

        if (uploadResponse.data && uploadResponse.data.url) {
            uploadedImageUrls.push({ src: uploadResponse.data.url });
        } else {
            throw new Error(`Image upload to '${QUEFOTO_UPLOAD_API_URL}' succeeded but returned no URL.`);
        }

      } catch (imageError: any) {
        console.error(`Error processing and uploading image ${photo.name}:`, imageError.response?.data || imageError.message);
        const userFriendlyError = `Error al procesar la imagen '${photo.name}'. Razón: ${imageError.message}`;
        return NextResponse.json({ success: false, error: userFriendlyError }, { status: 500 });
      }
    }
  }
  
  // 4. Send data to WooCommerce
  try {
    const formattedProduct = formatProductForWooCommerce(productData, uploadedImageUrls);
    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      const createdProduct = response.data;
      
      // Update image metadata in WordPress (don't wait for it)
      updateImageMetadata(createdProduct, productData);
      
      // Fire-and-forget deletion from external host
      deleteImagesFromExternalHost(uploadedImageUrls);
      
      return NextResponse.json({ success: true, data: createdProduct }, { status: response.status });
    } else {
      return NextResponse.json({ success: false, error: 'Received a non-successful status from WooCommerce.', details: response.data }, { status: response.status });
    }

  } catch (error: any) {
    console.error('Error creating product in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    return NextResponse.json({ success: false, error: errorMessage, details: error.response?.data }, { status: errorStatus });
  }
}
