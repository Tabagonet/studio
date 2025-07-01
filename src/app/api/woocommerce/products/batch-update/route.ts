
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { z } from 'zod';

const BatchUpdateSchema = z.object({
  productIds: z.array(z.number()).min(1),
  updates: z.object({
    status: z.enum(['publish', 'draft']).optional(),
    priceModification: z.object({
      field: z.enum(['regular_price', 'sale_price']),
      operation: z.enum(['increase', 'decrease', 'set']),
      type: z.enum(['fixed', 'percentage']),
      value: z.number().positive('El valor debe ser un número positivo.'),
    }).optional(),
    weight: z.string().optional(),
    dimensions: z.object({
        length: z.string(),
        width: z.string(),
        height: z.string(),
    }).optional(),
    shipping_class: z.string().optional(),
    manage_stock: z.boolean().optional(),
    stock_quantity: z.string().optional(),
  }),
});


export async function POST(req: NextRequest) {
    let uid: string;
    try {
        const token = req.headers.get('Authorization')?.split('Bearer ')[1];
        if (!token) throw new Error('Authentication token not provided.');
        if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
    } catch (error: any) {
        return NextResponse.json({ error: 'Authentication failed', message: error.message }, { status: 401 });
    }
    
    try {
        const body = await req.json();
        const validation = BatchUpdateSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid input', details: validation.error.flatten() }, { status: 400 });
        }
        
        const { productIds, updates } = validation.data;

        const { wooApi } = await getApiClientsForUser(uid);
        if (!wooApi) {
            throw new Error('WooCommerce API is not configured for the active connection.');
        }

        let batchUpdatePayload: { id: number; [key: string]: any }[] = [];
        let message = 'Proceso completado.';

        if (updates.priceModification) {
            const mod = updates.priceModification;
            const productChunks = [];
            for (let i = 0; i < productIds.length; i += 100) {
                productChunks.push(productIds.slice(i, i + 100));
            }

            const fetchedProducts = [];
            for (const chunk of productChunks) {
                const { data } = await wooApi.get('products', { 
                    include: chunk.join(','), 
                    per_page: 100,
                    lang: 'all'
                });
                fetchedProducts.push(...data);
            }
            
            if (fetchedProducts.length === 0) {
                throw new Error("No se encontraron los productos seleccionados para actualizar.");
            }

            batchUpdatePayload = fetchedProducts.map((product: any) => {
                const currentPrice = parseFloat(product[mod.field] || product.price) || 0;
                let newPrice: number;

                if (mod.operation === 'set') {
                    newPrice = mod.value;
                } else {
                    const changeAmount = mod.type === 'fixed'
                        ? mod.value
                        : currentPrice * (mod.value / 100);
                    
                    newPrice = mod.operation === 'increase'
                        ? currentPrice + changeAmount
                        : currentPrice - changeAmount;
                }
                
                return {
                    id: product.id,
                    [mod.field]: Math.max(0, newPrice).toFixed(2).toString(),
                };
            });
            message = `Se han modificado los precios de ${batchUpdatePayload.length} producto(s).`;
        } else {
            const updateData: any = {};
            if (updates.status) updateData.status = updates.status;
            if (updates.weight) updateData.weight = updates.weight;
            if (updates.shipping_class) updateData.shipping_class = updates.shipping_class;
            
            if (updates.dimensions && (updates.dimensions.length || updates.dimensions.width || updates.dimensions.height)) {
                updateData.dimensions = updates.dimensions;
            }

            if (updates.manage_stock !== undefined) {
                updateData.manage_stock = updates.manage_stock;
                if (updates.manage_stock && updates.stock_quantity) {
                     updateData.stock_quantity = parseInt(updates.stock_quantity, 10);
                }
            }
            
            batchUpdatePayload = productIds.map(id => ({ id, ...updateData }));
            message = `Se han actualizado los datos de ${productIds.length} producto(s).`;
        }
        
        if (batchUpdatePayload.length > 0) {
            const response = await wooApi.post('products/batch', { update: batchUpdatePayload });
            const updatedCount = response.data.update?.length || 0;
            const failedCount = batchUpdatePayload.length - updatedCount;

            if (failedCount > 0) {
                message += ` ${failedCount} producto(s) no pudieron ser actualizados.`;
            }
        }
        
        return NextResponse.json({
            message,
        });

    } catch (error: any) {
        console.error('Error in batch update API:', error.response?.data || error);
        return NextResponse.json({ error: 'An unexpected error occurred during batch processing.', message: error.response?.data?.message || error.message }, { status: 500 });
    }
}
