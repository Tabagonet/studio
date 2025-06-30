'use server';
/**
 * @fileOverview An AI flow for generating and enhancing blog post content.
 *
 * - generateBlogContent - Handles various blog content generation modes.
 * - BlogContentInput - The Zod schema for the flow's input.
 * - BlogContentOutput - The Zod schema for the flow's output.
 */
import {defineFlow} from '@genkit-ai/core';
import {googleAI} from '@genkit-ai/googleai';
import {z} from 'zod';
import Handlebars from 'handlebars';

export const BlogContentInputSchema = z.object({
  mode: z.enum([
    'generate_from_topic',
    'enhance_content',
    'enhance_title',
    'suggest_keywords',
    'generate_meta_description',
    'suggest_titles',
    'generate_image_meta',
    'generate_focus_keyword',
  ]),
  language: z.string().optional().default('Spanish'),
  topic: z.string().optional(),
  keywords: z.string().optional(),
  ideaKeyword: z.string().optional(),
  existingTitle: z.string().optional(),
  existingContent: z.string().optional(),
});
export type BlogContentInput = z.infer<typeof BlogContentInputSchema>;

export const BlogContentOutputSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  suggestedKeywords: z.string().optional(),
  metaDescription: z.string().optional(),
  titles: z.array(z.string()).optional(),
  imageTitle: z.string().optional(),
  imageAltText: z.string().optional(),
  focusKeyword: z.string().optional(),
});
export type BlogContentOutput = z.infer<typeof BlogContentOutputSchema>;

export const generateBlogContent = defineFlow(
  {
    name: 'blogContentFlow',
    inputSchema: BlogContentInputSchema,
    outputSchema: BlogContentOutputSchema,
  },
  async (input: BlogContentInput) => {
    let systemInstruction = '';
    let userPromptTemplate = ''; // Renamed for clarity
    let localOutputSchema = BlogContentOutputSchema; // Default schema

    // Sanitize and truncate content to avoid AI errors
    const contentSnippet = (input.existingContent || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1500);
    const modelInput = {...input, existingContent: contentSnippet};

    switch (input.mode) {
      case 'generate_from_topic':
        systemInstruction = `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. All paragraphs (<p> tags) MUST be styled with text-align: justify; for example: <p style="text-align: justify;">Your paragraph here.</p>), 'suggestedKeywords' (a comma-separated string of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Generate a blog post.
                Topic: "{{topic}}"
                Inspiration Keywords: "{{keywords}}"
                Language: {{language}}
            `;
        break;
      case 'enhance_content':
        systemInstruction = `You are an expert SEO copywriter. Your task is to analyze a blog post's title and content and rewrite them to be more engaging, clear, and SEO-optimized. Return a single, valid JSON object with two keys: 'title' and 'content'. The content should preserve the original HTML tags. Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Rewrite and improve the title and content in {{language}} for this blog post.
                Original Title: "{{existingTitle}}"
                Original Content:
                ---
                {{{existingContent}}}
                ---
            `;
        break;
      case 'enhance_title': {
        // Block scope for let
        systemInstruction = `You are an expert SEO copywriter. Your task is to rewrite a blog post title to be more engaging, clear, and SEO-optimized. The title must be under 60 characters. Respond with a single, valid JSON object containing only one key: "title". Do not include markdown or the word 'json' in your output.`;

        let promptText = `Rewrite and improve ONLY the title for this blog post in {{language}}.`;
        if (modelInput.keywords) {
          promptText += `\nIt is crucial that the new title includes the focus keyword: "{{keywords}}".`;
        }
        promptText += `\nOriginal Title: "{{existingTitle}}"\nContent for context:\n---\n{{{existingContent}}}\n---`;
        userPromptTemplate = promptText;

        localOutputSchema = z.object({title: z.string()}) as any;
        break;
      }
      case 'generate_meta_description':
        systemInstruction = `You are an expert SEO copywriter. Your task is to write a compelling meta description for the given blog post. The meta description must be no more than 160 characters long. The description should be engaging and encourage clicks. Return a single, valid JSON object with one key: 'metaDescription'. Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Generate a meta description in {{language}}.
                Title: "{{existingTitle}}"
                Content:
                ---
                {{{existingContent}}}
                ---
            `;
        localOutputSchema = z.object({metaDescription: z.string()}) as any;
        break;
      case 'generate_image_meta':
        systemInstruction = `You are an expert SEO specialist. Your task is to generate generic but descriptive SEO metadata for images that could appear in a blog post, based on its title and content. The response must be a single, valid JSON object with two keys: 'imageTitle' and 'imageAltText'. Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Generate generic image metadata in {{language}} for a blog post with the following details:
                Title: "{{existingTitle}}"
                Content Summary:
                ---
                {{{existingContent}}}
                ---
            `;
        localOutputSchema = z.object({
          imageTitle: z.string(),
          imageAltText: z.string(),
        }) as any;
        break;
      case 'suggest_titles':
        systemInstruction = `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Generate 5 blog post titles in {{language}} for the keyword: "{{ideaKeyword}}"
            `;
        localOutputSchema = z.object({titles: z.array(z.string())}) as any;
        break;
      case 'generate_focus_keyword':
        systemInstruction = `You are an expert SEO analyst. Your task is to identify the primary focus keyword (a short phrase of 2-4 words) from a blog post title and content. Return a single, valid JSON object with one key: 'focusKeyword'. The keyword should be in the same language as the content. Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Identify the focus keyword in {{language}} for this blog post:
                Title: "{{existingTitle}}"
                Content:
                ---
                {{{existingContent}}}
                ---
            `;
        localOutputSchema = z.object({focusKeyword: z.string()}) as any;
        break;
      case 'suggest_keywords':
        systemInstruction = `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (a comma-separated string of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.`;
        userPromptTemplate = `
                Generate SEO keywords for this blog post in {{language}}.
                Title: "{{existingTitle}}"
                Content:
                ---
                {{{existingContent}}}
                ---
            `;
        localOutputSchema = z.object({suggestedKeywords: z.string()}) as any;
        break;
    }

    if (!systemInstruction || !userPromptTemplate) {
      throw new Error(
        `Invalid mode provided to blog content flow: ${input.mode}`
      );
    }

    const template = Handlebars.compile(userPromptTemplate, {noEscape: true});
    const finalPrompt = template(modelInput);
    const model = googleAI.model('gemini-1.5-flash-latest');

    const {output} = await model.generate({
      system: systemInstruction,
      prompt: finalPrompt,
      output: {
        schema: localOutputSchema,
      },
    });

    if (!output) {
      throw new Error(
        'AI returned an empty response for blog content generation.'
      );
    }
    return output as BlogContentOutput;
  }
);
