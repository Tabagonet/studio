
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData, ProductPhoto } from '@/lib/types';
import axios from 'axios';

// Helper function to delete image from the external server
async function deleteImageFromQueFoto(imageUrl: string) {
  if (!imageUrl || !imageUrl.includes('quefoto.es')) {
    console.log(`[WooAutomate] Skipping deletion for non-quefoto or empty URL: ${imageUrl}`);
    return;
  }

  try {
    const fileName = imageUrl.split('/').pop();
    if (!fileName) {
      console.warn(`[WooAutomate] Could not extract filename from URL: ${imageUrl}`);
      return;
    }

    const response = await axios.post(
      "https://quefoto.es/delete.php",
      { fileName: fileName },
      { 
        headers: { "Content-Type": "application/json" },
        timeout: 10000 // 10 second timeout
      }
    );

    if (response.data?.success) {
      console.log(`[WooAutomate] Successfully deleted image ${fileName} from quefoto.es`);
    } else {
      console.warn(`[WooAutomate] Failed to delete image ${fileName} from quefoto.es. Reason: ${response.data?.error || 'Unknown'}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (axios.isAxiosError(error) && error.response) {
      console.error(`[WooAutomate] Axios error calling delete script for ${imageUrl}: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      console.error(`[WooAutomate] Error calling delete script for ${imageUrl}:`, errorMessage);
    }
  }
}


// Helper function to update image metadata after creation
async function updateImageMetadata(createdProduct: any, productData: ProductData) {
    const wooUrl = process.env.WOOCOMMERCE_STORE_URL;
    const consumerKey = process.env.WOOCOMMERCE_API_KEY;
    const consumerSecret = process.env.WOOCOMMERCE_API_SECRET;

    if (!wooUrl || !consumerKey || !consumerSecret) {
        console.warn('[WooAutomate] Cannot update image metadata: WooCommerce credentials are not fully configured.');
        return;
    }

    for (const image of createdProduct.images) {
        try {
            const metadataPayload: { title?: string; alt_text?: string; caption?: string, description?: string } = {};

            if (productData.name) {
              metadataPayload.title = productData.name;
              metadataPayload.alt_text = productData.name; // Alt text is crucial for SEO
            }
            if (productData.shortDescription) {
              // The caption is often displayed under the image.
              metadataPayload.caption = productData.shortDescription;
            }
            if (productData.longDescription) {
              // The description is for the media library.
              metadataPayload.description = productData.longDescription;
            }
            
            // Only make the call if there is data to update
            if (Object.keys(metadataPayload).length === 0) {
                continue;
            }

            const mediaUpdateUrl = `${wooUrl}/wp-json/wp/v2/media/${image.id}`;
            
            // WordPress REST API uses POST for updates on the media endpoint
            await axios.post(mediaUpdateUrl, metadataPayload, {
                auth: {
                  username: consumerKey,
                  password: consumerSecret,
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[WooAutomate] Successfully updated metadata for image ID: ${image.id}`);

        } catch (metaError: any) {
            console.warn(`[WooAutomate] Warning: Could not update metadata for image ID: ${image.id}.`);
            if (metaError.response) {
                console.warn(`[WooAutomate] Metadata Error (${metaError.response.status}):`, metaError.response.data);
            } else {
                console.warn('[WooAutomate] Metadata Error:', metaError.message);
            }
        }
    }
}


// Helper function to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData) => {
  const primaryPhoto = data.photos.find(p => p.isPrimary) || data.photos[0];
  const galleryPhotos = data.photos.filter(p => p.id !== primaryPhoto?.id);

  const wooImages = [];
  if (primaryPhoto?.url) {
    // Set name for title, and alt for alt text.
    wooImages.push({ src: primaryPhoto.url, position: 0, name: data.name, alt: data.name });
  }
  galleryPhotos.forEach((photo, index) => {
    if (photo.url) {
      // Set name for title, and alt for alt text.
      wooImages.push({ src: photo.url, position: index + 1, name: data.name, alt: data.name });
    }
  });

  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value) // Ensure attribute has name and value
    .map(attr => ({
      name: attr.name,
      // For variable products, options should be an array of strings.
      // For simple products, it's a single string in the `options` array.
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      // This is crucial for variable products.
      variation: data.productType === 'variable'
    }));
  
  const wooTags = data.keywords 
    ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) 
    : [];

  const wooProduct = {
    name: data.name,
    sku: data.sku || undefined, // Send undefined if empty to let WC handle it
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

  return wooProduct;
};

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
    console.error("Error verifying Firebase token in /api/woocommerce/products:", error);
    return NextResponse.json({ success: false, error: 'Invalid or expired authentication token.' }, { status: 401 });
  }

  // 2. Validate WooCommerce API client
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();

  try {
    // 3. Get and format product data
    const formattedProduct = formatProductForWooCommerce(productData);

    // 4. Send data to WooCommerce
    const response = await wooApi.post('products', formattedProduct);

    // 5. Handle WooCommerce response
    if (response.status >= 200 && response.status < 300) {
      const createdProduct = response.data;

      // Asynchronously update image caption and description metadata.
      // This is "fire and forget" so we don't delay the main response.
      if (createdProduct.images && createdProduct.images.length > 0) {
          console.log(`[WooAutomate] Product ${createdProduct.id} created. Updating metadata for ${createdProduct.images.length} images.`);
          updateImageMetadata(createdProduct, productData);
      }
      
      // "Fire and forget" deletion of images from the external server
      if (productData.photos && productData.photos.length > 0) {
        console.log(`[WooAutomate] Triggering background deletion of ${productData.photos.length} source images from quefoto.es.`);
        // We don't await this so the client gets a fast response.
        Promise.all(productData.photos.map(photo => deleteImageFromQueFoto(photo.url || '')))
          .catch(err => console.error('[WooAutomate] An error occurred during the background image deletion process:', err));
      }

      return NextResponse.json({ success: true, data: createdProduct }, { status: response.status });
    } else {
      // This case might not be hit if wooApi throws on non-2xx statuses, but it's good practice
      return NextResponse.json({ success: false, error: 'Received a non-successful status from WooCommerce.', details: response.data }, { status: response.status });
    }

  } catch (error: any) {
    // 6. Handle any errors during the process
    console.error('Error creating product in WooCommerce:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'An unknown error occurred while creating the product.';
    const errorStatus = error.response?.status || 500;
    return NextResponse.json({ success: false, error: errorMessage, details: error.response?.data }, { status: errorStatus });
  }
}
