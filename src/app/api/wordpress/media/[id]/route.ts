
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    const mediaId = params.id;
    if (!mediaId) {
      return NextResponse.json({ error: 'Media ID is required.' }, { status: 400 });
    }

    // `force: true` permanently deletes the media item, skipping the trash.
    const response = await wpApi.delete(`/media/${mediaId}`, { force: true });

    // We can also check response.data.deleted, which should be true
    return NextResponse.json({ success: true, data: response.data });

  } catch (error: any) {
    console.error(`Error deleting media ${params.id}:`, error.response?.data || error.message);
    const errorMessage = error.response?.data?.message || 'Failed to delete media item.';
    const status = error.message.includes('configure API connections') ? 400 : (error.response?.status || 500);
    
    return NextResponse.json(
      { error: errorMessage, details: error.response?.data },
      { status }
    );
  }
}
