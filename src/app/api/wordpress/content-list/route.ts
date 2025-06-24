
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { getApiClientsForUser } from '@/lib/api-helpers';

export interface ContentItem {
  id: number;
  title: string;
  type: 'Post' | 'Page';
  link: string;
  status: 'publish' | 'draft' | 'pending' | 'private' | 'future';
  parent: number;
  lang: string; // e.g., 'es', 'en'
  translations: Record<string, number>;
}

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
        return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) {
      throw new Error("Firebase Admin Auth is not initialized.");
    }
    const uid = (await adminAuth.verifyIdToken(token)).uid;
    
    const { wpApi } = await getApiClientsForUser(uid);
    if (!wpApi) {
        throw new Error('WordPress API is not configured for the active connection.');
    }

    const languagesToFetch = ['es', 'en', 'fr', 'de', 'pt']; // Check for common languages
    const allContent: ContentItem[] = [];

    const fetchContentForLang = async (lang: string): Promise<ContentItem[]> => {
      const fetchParams = {
          per_page: 100, 
          status: 'publish,draft,pending,private,future',
          orderby: 'title',
          order: 'asc',
          context: 'view',
          lang: lang,
      };

      try {
        const [postsResponse, pagesResponse] = await Promise.all([
            wpApi.get('/posts', { params: fetchParams }),
            wpApi.get('/pages', { params: fetchParams })
        ]);

        const mapContent = (item: any): ContentItem => ({
            id: item.id,
            title: item.title?.rendered || 'No Title',
            type: item.type === 'post' ? 'Post' : 'Page',
            link: item.link,
            status: item.status,
            parent: item.parent || 0,
            lang: lang.toUpperCase(), // Assign the language we requested
            translations: item.translations || {},
        });

        const posts: ContentItem[] = postsResponse.data.map(mapContent);
        const pages: ContentItem[] = pagesResponse.data.map(mapContent);
        
        return [...posts, ...pages];
      } catch (error) {
        // This is expected if a language doesn't exist on the site, so we just log and ignore.
        // console.log(`No content found for language '${lang}' or error fetching it.`);
        return [];
      }
    };
    
    const promises = languagesToFetch.map(lang => fetchContentForLang(lang));
    const results = await Promise.all(promises);
    results.forEach(contentArray => allContent.push(...contentArray));
        
    return NextResponse.json({ content: allContent });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
