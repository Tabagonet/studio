
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
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

    const statusesToCount = ['publish', 'draft'];
    const typesToCount = ['simple', 'variable', 'grouped'];

    // Helper to get count from headers
    const getCount = async (params: any): Promise<number> => {
      try {
        const response = await wooApi.get("products", { ...params, per_page: 1 });
        const total = response.headers['x-wp-total'];
        return total ? parseInt(total, 10) : 0;
      } catch (e) {
        console.error(`Failed to get count for params: ${JSON.stringify(params)}`, e);
        return 0;
      }
    };

    // Perform all count requests in parallel
    const allCountPromises = [
        getCount({}), // Total products
        ...statusesToCount.map(status => getCount({ status })),
        ...typesToCount.map(type => getCount({ type })),
    ];
    
    const counts = await Promise.all(allCountPromises);

    const [total, ...restCounts] = counts;
    const statusCounts = restCounts.slice(0, statusesToCount.length);
    const typeCounts = restCounts.slice(statusesToCount.length);

    const stats = {
      total: total,
      status: statusesToCount.reduce((acc, status, index) => {
        (acc as any)[status] = statusCounts[index];
        return acc;
      }, {} as { [key: string]: number }),
      type: typesToCount.reduce((acc, type, index) => {
        (acc as any)[type] = typeCounts[index];
        return acc;
      }, {} as { [key: string]: number }),
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching WooCommerce product stats:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch product stats.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
