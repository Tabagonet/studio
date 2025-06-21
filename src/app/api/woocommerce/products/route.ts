
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminStorage } from '@/lib/firebase-admin';
import { wooApi } from '@/lib/woocommerce';
import type { ProductData } from '@/lib/types';
import axios from 'axios';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';


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
            
            if (Object.keys(metadataPayload).length === 0) {
                continue;
            }

            const mediaUpdateUrl = `${wooUrl}/wp-json/wp/v2/media/${image.id}`;
            
            await axios.post(mediaUpdateUrl, metadataPayload, {
                auth: {
                  username: consumerKey,
                  password: consumerSecret,
                },
                headers: { 'Content-Type': 'application/json' }
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

// Helper to create a URL-friendly slug
const slugify = (text: string) => {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w-]+/g, '')       // Remove all non-word chars
        .replace(/--+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start of text
        .replace(/-+$/, '');            // Trim - from end of text
};

// Helper function to format data for WooCommerce API
const formatProductForWooCommerce = (data: ProductData, processedImageUrls: { src: string }[]) => {
  const wooAttributes = data.attributes
    .filter(attr => attr.name && attr.value)
    .map(attr => ({
      name: attr.name,
      options: data.productType === 'variable' ? attr.value.split('|').map(s => s.trim()) : [attr.value],
      visible: true,
      variation: data.productType === 'variable'
    }));
  
  const wooTags = data.keywords 
    ? data.keywords.split(',').map(k => ({ name: k.trim() })).filter(k => k.name) 
    : [];

  const wooImages = processedImageUrls.map((img, index) => ({
      src: img.src,
      position: index,
      name: data.name,
      alt: data.name,
  }));

  const wooProduct = {
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

  // 2. Validate WooCommerce & Firebase Admin clients
  if (!wooApi) {
    return NextResponse.json({ success: false, error: 'WooCommerce API client is not configured on the server.' }, { status: 503 });
  }
  if (!adminStorage) {
    return NextResponse.json({ success: false, error: 'Firebase Storage Admin client is not configured on the server.' }, { status: 503 });
  }

  const productData: ProductData = await request.json();
  const processedImageUrls: { src: string }[] = [];

  // 3. Process and upload images to Firebase Storage
  if (productData.photos && productData.photos.length > 0) {
    const bucket = adminStorage.bucket();

    // Sort photos to ensure primary is first
    const sortedPhotos = [...productData.photos].sort((a, b) => (a.isPrimary ? -1 : b.isPrimary ? 1 : 0));

    for (const photo of sortedPhotos) {
      if (!photo.dataUri) continue;

      try {
        const base64EncodedImageString = photo.dataUri.split(',')[1];
        if (!base64EncodedImageString) throw new Error('Invalid data URI');

        const imageBuffer = Buffer.from(base64EncodedImageString, 'base64');
        
        const processedBuffer = await sharp(imageBuffer)
            .resize(1000, 1000, { fit: 'cover' })
            .webp({ quality: 85 })
            .toBuffer();

        const seoFilename = `${slugify(productData.name || 'product')}-${uuidv4()}.webp`;
        const filePath = `product-images/${seoFilename}`;
        const file = bucket.file(filePath);

        await file.save(processedBuffer, {
            metadata: { contentType: 'image/webp' },
            public: true,
        });
        
        const publicUrl = file.publicUrl();
        processedImageUrls.push({ src: publicUrl });

      } catch (imageError: any) {
        console.error(`Error processing image ${photo.name}:`, imageError);

        if (imageError.code === 404 || (imageError.message && imageError.message.toLowerCase().includes('bucket does not exist'))) {
          const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
          const userFriendlyError = `Error de Configuración: El bucket de Firebase Storage ('${bucketName || 'No configurado'}') no existe. \n\n**Solución:**\n1. Ve a tu Consola de Firebase.\n2. Ve a la sección "Storage".\n3. Haz clic en "Comenzar" para crear el bucket por defecto.\n4. Asegúrate de que la variable de entorno NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET coincide con el nombre del bucket.`;
          return NextResponse.json({ success: false, error: userFriendlyError }, { status: 500 });
        }
        
        return NextResponse.json({ success: false, error: `Failed to process image: ${photo.name}. Reason: ${imageError.message}` }, { status: 500 });
      }
    }
  }
  
  // 4. Send data to WooCommerce
  try {
    const formattedProduct = formatProductForWooCommerce(productData, processedImageUrls);

    const response = await wooApi.post('products', formattedProduct);

    if (response.status >= 200 && response.status < 300) {
      const createdProduct = response.data;

      // Asynchronously update image caption and description metadata.
      if (createdProduct.images && createdProduct.images.length > 0) {
          console.log(`[WooAutomate] Product ${createdProduct.id} created. Updating metadata for ${createdProduct.images.length} images.`);
          updateImageMetadata(createdProduct, productData);
      }
      
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
