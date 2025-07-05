'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { RichTextToolbar } from './rich-text-toolbar';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RichTextEditorProps {
  content: string;
  onChange: (richText: string) => void;
  onInsertImage: () => void;
  placeholder?: string;
}

export function RichTextEditor({ content, onChange, onInsertImage, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      Image.configure({
        inline: false,
        allowBase64: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Escribe algo increíble...',
      }),
    ],
    content: content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none px-3 py-2 min-h-[300px]',
      },
    },
  });
  
  return (
    <div className="rounded-md border border-input bg-transparent ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <RichTextToolbar editor={editor} onInsertImage={onInsertImage} />
      <ScrollArea className="h-auto max-h-[500px]">
        <EditorContent editor={editor} />
      </ScrollArea>
    </div>
  );
}
