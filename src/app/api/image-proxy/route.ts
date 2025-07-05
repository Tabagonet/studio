
import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
  }

  try {
    // Basic validation to ensure it's a valid URL
    new URL(imageUrl);

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      }
    });

    const buffer = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/png';

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=86400, immutable');

    return new NextResponse(buffer, { status: 200, headers });

  } catch (error) {
    console.error('[IMAGE PROXY] Error:', error);
    if (axios.isAxiosError(error)) {
        const status = error.response?.status || 502;
        const message = error.response?.statusText || 'Failed to fetch image from upstream server.';
        return NextResponse.json({ error: message }, { status });
    }
    return NextResponse.json({ error: 'Failed to fetch image due to an internal error.' }, { status: 500 });
  }
}
