

import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser, findOrCreateWpCategoryByPath } from '@/lib/api-helpers';
import { z } from 'zod';
import { adminAuth } from '@/lib/firebase-admin';
import type { ProductVariation, WooCommerceImage } from '@/lib/types';


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
    supplier: z.string().optional().nullable(),
    newSupplier: z.string().optional(),
    type: z.enum(['simple', 'variable', 'grouped', 'external']).optional(),
    regular_price: z.string().optional(),
    sale_price: z.string().optional(),
    short_description: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(['publish', 'draft', 'pending', 'private']).optional(),
    tags: z.array(z.string()).optional(),
    category_id: z.number().nullable().optional(),
    images: z.array(z.object({
        id: z.number().optional(), // For existing images
        src: z.string().url().optional(), // For new images from a temporary URL
    })).optional(),
    variations: z.array(z.any()).optional(),
    // Metadata for any new images being uploaded
    imageTitle: z.string().optional(),
    imageAltText: z.string().optional(),
    imageCaption: z.string().optional(),
    imageDescription: z.string().optional(),
    // Inventory and shipping
    manage_stock: z.boolean().optional(),
    stock_quantity: z.union([z.string(), z.number()]).optional(),
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

    const { data: productData } = await wooApi.get(`products/${productId}`);
    
    if (productData.type === 'variable') {
        const { data: variationsData } = await wooApi.get(`products/${productId}/variations`, { per_page: 100 });
        productData.variations = variationsData;
    }
    
    return NextResponse.json(productData);

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
    const { imageTitle, imageAltText, imageCaption, imageDescription, variations, supplier, newSupplier, ...restOfData } = validatedData;
    const wooPayload: any = { ...restOfData };
    
    const { data: originalProduct } = await wooApi.get(`products/${productId}`);

    if (validatedData.tags !== undefined) {
      wooPayload.tags = validatedData.tags.map((name: string) => ({ name }));
    }
    
    // Category Management
    const currentCategoryIds = originalProduct.categories.map((c: any) => c.id);
    let finalCategoryIds = validatedData.category_id ? [{ id: validatedData.category_id }] : [];
    
    // Supplier Management
    const finalSupplierName = newSupplier || supplier;
    if (finalSupplierName !== undefined) {
        const originalSupplierAttr = originalProduct.attributes.find((a: any) => a.name === 'Proveedor');
        const originalSupplierName = originalSupplierAttr ? originalSupplierAttr.options[0] : null;

        if (originalSupplierName && originalSupplierName !== finalSupplierName) {
            const allCategories = (await wooApi.get('products/categories', { per_page: 100 })).data;
            const oldSupplierCategory = allCategories.find((c: any) => c.name === originalSupplierName);
            if (oldSupplierCategory) {
                finalCategoryIds = currentCategoryIds.filter((id: number) => id !== oldSupplierCategory.id);
            }
        }
        
        if (finalSupplierName) {
            if (!wpApi) {
              throw new Error('La API de WordPress debe estar configurada para gestionar proveedores como categorías.');
            }
            const supplierCatId = await findOrCreateWpCategoryByPath(`Proveedores > ${finalSupplierName}`, wpApi, 'product_cat');
            if (supplierCatId && !finalCategoryIds.some(c => c.id === supplierCatId)) {
                finalCategoryIds.push({ id: supplierCatId });
            }
            
            const supplierAttr = { name: 'Proveedor', options: [finalSupplierName], visible: true, variation: false };
            const existingAttributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
            wooPayload.attributes = [...existingAttributes, supplierAttr];
            wooPayload.slug = slugify(`${validatedData.name || originalProduct.name}-${finalSupplierName}`);
        } else if (originalSupplierName) { // Supplier was cleared
            wooPayload.attributes = originalProduct.attributes.filter((a: any) => a.name !== 'Proveedor');
            wooPayload.slug = slugify(validatedData.name || originalProduct.name);
        }
    }
    
    wooPayload.categories = finalCategoryIds;

    if (validatedData.images) {
      wooPayload.images = validatedData.images;
    } else {
      delete wooPayload.images;
    }
    
    // Correctly handle stock quantity based on stock management flag
    if (wooPayload.manage_stock === false) {
        wooPayload.stock_quantity = null; // Set to null if not managing stock
    } else if (wooPayload.stock_quantity !== undefined && wooPayload.stock_quantity !== null && wooPayload.stock_quantity !== '') {
        const stock = parseInt(String(wooPayload.stock_quantity), 10);
        wooPayload.stock_quantity = isNaN(stock) ? null : stock;
    } else {
        // If manage_stock is true but quantity is empty/null, set it to 0 or null
        wooPayload.stock_quantity = null;
    }

    
    const response = await wooApi.put(`products/${productId}`, wooPayload);
    
    if (variations && variations.length > 0) {
        const batchPayload = {
            update: variations.map((v: ProductVariation) => ({
                id: v.variation_id,
                regular_price: v.regularPrice || undefined,
                sale_price: v.salePrice || undefined,
                sku: v.sku || undefined,
                manage_stock: v.manage_stock,
                stock_quantity: v.manage_stock ? (parseInt(v.stockQuantity, 10) || null) : undefined,
                weight: v.weight || undefined,
                dimensions: v.dimensions,
                shipping_class: v.shipping_class || undefined,
            }))
        };
        await wooApi.post(`products/${productId}/variations/batch`, batchPayload);
    }

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
