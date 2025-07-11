import {NextRequest, NextResponse} from 'next/server';
import {adminAuth, adminDb} from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  let uid: string;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) throw new Error('No se proporcionó token de autenticación.');
    if (!adminAuth)
      throw new Error('La autenticación del administrador de Firebase no está inicializada.');
    uid = (await adminAuth.verifyIdToken(token)).uid;
  } catch (error: any) {
    return NextResponse.json({error: error.message}, {status: 401});
  }

  if (!adminDb) {
    return NextResponse.json(
      {error: 'Firestore no configurado en el servidor'},
      {status: 503}
    );
  }

  const {searchParams} = new URL(req.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      {error: 'El parámetro URL es obligatorio.'},
      {status: 400}
    );
  }

  // Helper function to normalize URLs for robust comparison
  const normalizeUrl = (u: string): string => {
    try {
      // Using URL constructor is safer for complex URLs
      const parsed = new URL(u);
      // Compare only hostname and pathname, ignoring protocol, www, and trailing slashes
      return `${parsed.hostname.replace(/^www\./, '')}${parsed.pathname.replace(
        /\/$/,
        ''
      )}`;
    } catch (e) {
      // Fallback for simple strings that might not have a protocol
      return u.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    }
  };

  const normalizedRequestUrl = normalizeUrl(url);

  try {
    // Querying all and filtering in-memory is necessary if we can't guarantee
    // the stored URL format is consistent for an indexed query.
    const userAnalysesSnapshot = await adminDb
      .collection('seo_analyses')
      .where('userId', '==', uid)
      .get();

    const allHistoryForUser = userAnalysesSnapshot.docs
      .map(doc => {
        const data = doc.data();
        if (
          !data ||
          !data.createdAt ||
          typeof data.createdAt.toDate !== 'function'
        ) {
          return null;
        }
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt.toDate().toISOString(),
        };
      })
      .filter(Boolean as any as (value: any) => value is NonNullable<any>);

    // Filter using the normalized URLs
    const historyForUrl = allHistoryForUser.filter(record => {
      return normalizeUrl(record.url) === normalizedRequestUrl;
    });

    historyForUrl.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const limitedHistory = historyForUrl.slice(0, 10);

    return NextResponse.json({history: limitedHistory});
  } catch (error: any) {
    console.error('Error fetching SEO analysis history:', error);
    return NextResponse.json(
      {
        error: 'Fallo al obtener el historial de análisis',
        details: error.message,
      },
      {status: 500}
    );
  }
}
