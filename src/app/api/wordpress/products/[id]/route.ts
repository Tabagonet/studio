
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser, uploadImageToWordPress } from '@/lib/api-helpers';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const slugify = (text: string) => {
    if (!text) return '';
    return text.toString().toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+$/, '');
};

const productUpdateSchema = z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    meta: z.object({
        _yoast_wpseo_title: z.string().optional(),
        _yoast_wpseo_metadesc: z.string().optional(),
        _yoast_wpseo_focuskw: z.string().optional(),
    }).optional(),
    featured_image_metadata: z.object({
        title: z.string(),
        alt_text: z.string(),
    }).optional(),
    image_alt_updates: z.array(z.object({
        id: z.number(),
        alt: z.string(),
    })).optional(),
});


export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wooApi } = await getApiClientsForUser(uid);
    if (!wooApi) {
        throw new Error('WooCommerce API is not configured for the active connection.');
    }

    const productId = params.id;
    if (!productId) return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });

    const response = await wooApi.get(`products/${productId}`);
    const productData = response.data;

    const getMetaValue = (key: string) => {
        const meta = productData.meta_data.find((m: any) => m.key === key);
        return meta ? meta.value : '';
    };

    // Map to a structure consistent with posts/pages for the frontend editor
    const transformed = {
      title: productData.name, // Return a flat string
      content: { rendered: productData.description || '' }, // Keep object structure for compatibility
      short_description: productData.short_description || '',
      link: productData.permalink,
      meta: {
          _yoast_wpseo_title: getMetaValue('_yoast_wpseo_title') || productData.name,
          _yoast_wpseo_metadesc: getMetaValue('_yoast_wpseo_metadesc') || productData.short_description || '',
          _yoast_wpseo_focuskw: getMetaValue('_yoast_wpseo_focuskw'),
      },
      featured_media: productData.images?.[0]?.id || null,
      featured_image_url: productData.images?.[0]?.src || null,
      isElementor: false,
      elementorEditLink: null,
      adminEditLink: productData.permalink ? `${new URL(productData.permalink).origin}/wp-admin/post.php?post=${productData.id}&action=edit` : null,
      scrapedImages: (productData.images || []).map((img: any) => ({
          id: img.src,
          src: img.src,
          alt: img.alt || '',
          mediaId: img.id,
      })),
    };

    return NextResponse.json(transformed);

  } catch (error: any) {
    console.error(`Error fetching product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch product details.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No auth token provided.');
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wooApi, wpApi } = await getApiClientsForUser(uid);
    if (!wooApi || !wpApi) {
        throw new Error('Both WooCommerce & WordPress APIs must be configured.');
    }

    const productId = Number(params.id);
    if (!productId) return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });

    const body = await req.json();
    const validation = productUpdateSchema.safeParse(body);
    if (!validation.success) return NextResponse.json({ error: 'Invalid data.', details: validation.error.flatten() }, { status: 400 });
    
    const { title, content, meta, featured_image_metadata, image_alt_updates } = validation.data;
    
    const wooPayload: any = {};
    if (title) wooPayload.name = title;
    // Map the 'content' field from the editor back to WooCommerce's 'description' field
    if (content !== undefined) wooPayload.description = content;
    
    if (meta) {
        wooPayload.meta_data = Object.entries(meta).map(([key, value]) => ({ key, value }));
    }

    const response = await wooApi.put(`products/${productId}`, wooPayload);
    
    // The logic for updating image metadata still needs the WordPress API, as media items are managed by WordPress core.
    if (featured_image_metadata && response.data.featured_media) {
        try {
            await wpApi.post(`/media/${response.data.featured_media}`, {
                title: featured_image_metadata.title,
                alt_text: featured_image_metadata.alt_text,
            });
        } catch (mediaError: any) {
            console.warn(`Product updated, but failed to update featured image metadata for media ID ${response.data.featured_media}:`, mediaError.response?.data?.message || mediaError.message);
        }
    }

    if (image_alt_updates && image_alt_updates.length > 0) {
        for (const update of image_alt_updates) {
            try {
                await wpApi.post(`/media/${update.id}`, {
                    alt_text: update.alt
                });
            } catch (mediaError: any) {
                console.warn(`Failed to update alt text for media ID ${update.id}:`, mediaError.response?.data?.message || mediaError.message);
            }
        }
    }
    
    return NextResponse.json({ success: true, data: response.data });
  } catch (error: any) {
    console.error(`Error updating product ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to update product.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
