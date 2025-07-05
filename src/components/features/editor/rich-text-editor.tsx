'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { RichTextToolbar } from './rich-text-toolbar';

interface RichTextEditorProps {
  content: string;
  onChange: (richText: string) => void;
  onInsertImage: () => void;
  placeholder?: string;
  stickyToolbar?: boolean;
}

export function RichTextEditor({ content, onChange, onInsertImage, placeholder, stickyToolbar = false }: RichTextEditorProps) {
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
        class: 'ProseMirror',
      },
    },
  });
  
  return (
    <div>
      <RichTextToolbar editor={editor} onInsertImage={onInsertImage} sticky={stickyToolbar} />
      <EditorContent editor={editor} />
    </div>
  );
}
