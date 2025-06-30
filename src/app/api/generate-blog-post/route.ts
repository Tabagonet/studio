import '@/ai/genkit'; // Ensure Genkit is initialized
import {NextRequest, NextResponse} from 'next/server';
import {adminAuth} from '@/lib/firebase-admin';
import {
  generateBlogContent,
  BlogContentInputSchema,
} from '@/ai/flows/generate-blog-content-flow';
import {runFlow} from '@genkit-ai/core';

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json(
        {error: 'Authentication token not provided.'},
        {status: 401}
      );
    }
    if (!adminAuth) throw new Error('Firebase Admin Auth is not initialized.');
    await adminAuth.verifyIdToken(token);
  } catch (error) {
    return NextResponse.json({error: 'Authentication failed.'}, {status: 401});
  }

  try {
    const body = await req.json();
    const validationResult = BlogContentInputSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {error: 'Invalid input', details: validationResult.error.flatten()},
        {status: 400}
      );
    }

    const generatedContent = await runFlow(
      generateBlogContent,
      validationResult.data
    );

    return NextResponse.json(generatedContent);
  } catch (error: any) {
    console.error('Error generating blog post with flow:', error);
    return NextResponse.json(
      {error: 'Failed to generate blog post', message: error.message},
      {status: 500}
    );
  }
}
