
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
};


// Schema for updating a product
const productUpdateSchema = z.object({
    name: z.string().min(1, 'Name cannot be empty.').optional(),
    sku: z.string().optional(),
    regular_price: z.string().optional(),
    sale_price: z.string().optional(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private']).optional(),
    tags: z.string().optional(),
    category_id: z.number().nullable().optional(),
    images: z.array(z.object({
        id: z.number().optional(), // For existing images
        src: z.string().url().optional(), // For new images from a temporary URL
    })).optional(),
    // Metadata for any new images being uploaded
    imageTitle: z.string().optional(),
    imageAltText: z.string().optional(),
    imageCaption: z.string().optional(),
    imageDescription: z.string().optional(),
    // Inventory and shipping
    manage_stock: z.boolean().optional(),
    stock_quantity: z.string().optional(),
    weight: z.string().optional(),
    dimensions: z.object({
        length: z.string(),
        width: z.string(),
        height: z.string(),
    }).optional(),
    shipping_class: z.string().optional(),
});


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
      throw new Error('WooCommerce API is not configured for the active connection.');
    }
    
    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const response = await wooApi.get(`products/${productId}`);
    return NextResponse.json(response.data);

  } catch (error: any) {
    console.error(`Error fetching product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch product details.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi, wpApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }

    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const body = await req.json();

    const validationResult = productUpdateSchema.safeParse(body);
        if (!validationResult.success) {
            return NextResponse.json({ error: 'Invalid product data.', details: validationResult.error.flatten() }, { status: 400 });
    }
    
    const validatedData = validationResult.data;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { imageTitle, imageAltText, imageCaption, imageDescription, ...restOfData } = validatedData;
    const wooPayload: any = { ...restOfData };
    
    // Process tags and categories from validated data
    if (validatedData.tags !== undefined) {
      wooPayload.tags = validatedData.tags.split(',').map((k: string) => ({ name: k.trim() })).filter((t: any) => t.name);
    }
    
    if (validatedData.category_id !== undefined) {
      wooPayload.categories = validatedData.category_id ? [{ id: validatedData.category_id }] : [];
      delete wooPayload.category_id;
    }

    // New Image Handling Logic
    if (validatedData.images) {
        if (!wpApi) {
          throw new Error('WordPress API must be configured to upload new images.');
        }
        const processedImages = [];
        let imageIndex = 0;

        for (const image of validatedData.images) {
            if (image.id) {
                // It's an existing image, just add its ID. Position is determined by array order.
                processedImages.push({ id: image.id });
            } else if (image.src) {
                // It's a new image from a temporary URL, upload it to WordPress
                const baseNameForSeo = imageTitle || validatedData.name || 'product-image';
                const filenameSuffix = validatedData.images.length > 1 ? `-${productId}-${imageIndex + 1}` : `-${productId}`;
                
                // Pass a .jpg name, the helper will convert it to .webp
                const seoFilename = `${slugify(baseNameForSeo)}${filenameSuffix}.jpg`;

                const newImageId = await uploadImageToWordPress(
                    image.src,
                    seoFilename,
                    {
                        title: imageTitle || validatedData.name || '',
                        alt_text: imageAltText || validatedData.name || '',
                        caption: imageCaption || '',
                        description: imageDescription || '',
                    },
                    wpApi
                );
                processedImages.push({ id: newImageId });
            }
            imageIndex++;
        }
        wooPayload.images = processedImages;
    } else {
        // If 'images' key is not present in payload, don't touch the images.
        delete wooPayload.images;
    }
    
    // Handle stock quantity: it should be a number for WooCommerce API
    if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
        wooPayload.stock_quantity = parseInt(wooPayload.stock_quantity, 10);
    }
    
    const response = await wooApi.put(`products/${productId}`, wooPayload);

    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any)
 {
    console.error(`Error updating product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update product.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }

    const productId = params.id;
    if (!productId) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    // `force: true` permanently deletes the product.
    // `force: false` would move it to trash.
    const response = await wooApi.delete(`products/${productId}`, { force: true });

    return NextResponse.json({ success: true, data: response.data });

  } catch (error: any) {
    console.error(`Error deleting product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to delete product.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
