

'use client';

import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { RichTextToolbar } from './rich-text-toolbar';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  content: string;
  onChange: (richText: string) => void;
  onInsertImage: () => void;
  onSuggestLinks?: () => void;
  placeholder?: string;
  size?: 'default' | 'small';
}

export function RichTextEditor({ content, onChange, onInsertImage, onSuggestLinks, placeholder, size = 'default' }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
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
    immediatelyRender: false,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
            'prose prose-sm sm:prose-base dark:prose-invert max-w-none focus:outline-none px-3 py-2 overflow-y-auto',
            size === 'default' && 'min-h-[300px] max-h-[500px]',
            size === 'small' && 'min-h-[120px] max-h-[200px]',
        ),
      },
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      const editorContent = editor.getHTML();
      // Only update if the prop content is different from the editor's content
      // to avoid infinite loops and unnecessary updates.
      if (content !== editorContent) {
        // Use `setContent` to update the editor state when the 'content' prop changes
        editor.commands.setContent(content, false); // false to prevent firing 'onUpdate' and causing a loop
      }
    }
  }, [content, editor]);
  
  return (
    <div className="rounded-md border border-input bg-transparent ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      <RichTextToolbar editor={editor} onInsertImage={onInsertImage} onSuggestLinks={onSuggestLinks} />
      <EditorContent editor={editor} />
    </div>
  );
}
