
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
  lang: string;
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

    // Step 1: Fetch all available languages from the Polylang REST API
    let languages: { slug: string }[] = [];
    try {
        const languagesResponse = await wpApi.get('/polylang/v1/languages');
        if (languagesResponse.data && Array.isArray(languagesResponse.data) && languagesResponse.data.length > 0) {
            languages = languagesResponse.data;
        } else {
            // Fallback for when no languages are returned or endpoint fails
            languages.push({ slug: '' }); // An empty slug fetches default language content
        }
    } catch (langError) {
        console.warn("Could not fetch languages from Polylang endpoint, falling back to default.", langError);
        languages.push({ slug: '' });
    }

    const allContent: ContentItem[] = [];

    // Step 2: For each language, fetch all posts and pages
    for (const lang of languages) {
        const langSlug = lang.slug;

        const fetchParams = {
            per_page: 100, 
            status: 'publish,draft,pending,private,future',
            orderby: 'title',
            order: 'asc',
            context: 'view',
            // If langSlug is empty, this parameter is omitted, fetching default language content
            ...(langSlug && { lang: langSlug }),
        };

        const [postsResponse, pagesResponse] = await Promise.all([
            wpApi.get('/posts', { params: fetchParams }).catch(e => { console.error(`Failed to fetch posts for lang ${langSlug}`, e.response?.data); return { data: [] }; }),
            wpApi.get('/pages', { params: fetchParams }).catch(e => { console.error(`Failed to fetch pages for lang ${langSlug}`, e.response?.data); return { data: [] }; })
        ]);
   
        const mapContent = (item: any): ContentItem => {
            return {
                id: item.id,
                title: item.title?.rendered || 'No Title',
                type: item.type === 'post' ? 'Post' : 'Page',
                link: item.link,
                status: item.status,
                parent: item.parent || 0, // Using 0 for consistency for root items
                // Manually assign the language slug we used for the fetch
                lang: langSlug || 'default', 
                translations: item.translations || {},
            };
        };

        const posts: ContentItem[] = postsResponse.data.map(mapContent);
        const pages: ContentItem[] = pagesResponse.data.map(mapContent);
    
        allContent.push(...posts, ...pages);
    }
        
    return NextResponse.json({ content: allContent });
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 'Failed to fetch content list.';
    const status = error.message.includes('not configured') ? 400 : (error.response?.status || 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
}
