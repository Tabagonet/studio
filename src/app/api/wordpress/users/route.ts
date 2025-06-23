
import { NextRequest, NextResponse } from 'next/server';
import { getApiClientsForUser } from '@/lib/api-helpers';
import type { WordPressUser } from '@/lib/types';
import { adminAuth } from '@/lib/firebase-admin';

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    await adminAuth.verifyIdToken(token);
    const uid = (await adminAuth.verifyIdToken(token)).uid;


    const { wpApi } = await getApiClientsForUser(uid);

    // Fetch all users. You might want to add role filtering if your setup requires it.
    // For example, roles: ['administrator', 'editor', 'author']
    const response = await wpApi.get("users", { per_page: 100, roles: ['administrator', 'editor', 'author'] });
    
    const users: WordPressUser[] = response.data
        .map((user: any) => ({
          id: user.id,
          name: user.name,
          slug: user.slug,
          avatar_urls: user.avatar_urls,
        }));
        
    return NextResponse.json(users);
  } catch (error: any) {
    console.error('Error fetching WordPress users:', error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to fetch users.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
