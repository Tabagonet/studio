
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

    const { wpApi } = await getApiClientsForUser(uid);

    const statusesToCount = ['publish', 'draft', 'future', 'private', 'pending'];

    const getCount = async (params: any): Promise<number> => {
      try {
        const response = await wpApi.get("/posts", { params: { ...params, per_page: 1 } });
        const total = response.headers['x-wp-total'];
        return total ? parseInt(total, 10) : 0;
      } catch (e) {
        console.error(`Failed to get count for params: ${JSON.stringify(params)}`, e);
        return 0;
      }
    };

    // Get counts for each status in parallel
    const statusCountPromises = statusesToCount.map(status => getCount({ status }));
    const statusCountsArray = await Promise.all(statusCountPromises);
    
    // Sum the counts for the total
    const total = statusCountsArray.reduce((sum, count) => sum + count, 0);

    // Build the status object for the response
    const statusCountsObject = statusesToCount.reduce((acc, status, index) => {
        (acc as any)[status] = statusCountsArray[index];
        return acc;
    }, {} as { [key: string]: number });


    const stats = {
      total: total,
      status: statusCountsObject
    };

    return NextResponse.json(stats);

  } catch (error: any) {
    console.error('Error fetching WordPress post stats:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch post stats.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}

