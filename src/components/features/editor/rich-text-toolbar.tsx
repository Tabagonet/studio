
'use client';

import { type Editor } from '@tiptap/react';
import {
  Bold, Strikethrough, Italic, List, ListOrdered, Heading1, Heading2, Heading3, Quote, AlignLeft, AlignCenter, AlignRight, AlignJustify, Underline, Link as LinkIcon, Image as ImageIcon, Link2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCallback, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type Props = {
  editor: Editor | null;
  onInsertImage: () => void;
  onSuggestLinks?: () => void;
};

export const RichTextToolbar = ({ editor, onInsertImage, onSuggestLinks }: Props) => {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  
  const handleOpenLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkUrl(previousUrl);
    setIsLinkDialogOpen(true);
  }, [editor]);
  
  const handleSetLink = useCallback(() => {
    if (!editor) {
      setIsLinkDialogOpen(false);
      return;
    }

    if (linkUrl === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      setIsLinkDialogOpen(false);
      return;
    }
    
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setIsLinkDialogOpen(false);
  }, [editor, linkUrl]);


  if (!editor) {
    return null;
  }

  return (
    <>
      <div className={cn("sticky top-0 z-10 flex items-center gap-1 mb-0 rounded-t-md border-b bg-muted p-1 flex-wrap")}>
        {/* Text Formatting */}
        <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBold().run()} disabled={!editor.can().chain().focus().toggleBold().run()} data-active={editor.isActive('bold')} data-tiptap-toolbar-button title="Negrita" className="h-8 w-8">
          <Bold className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleItalic().run()} disabled={!editor.can().chain().focus().toggleItalic().run()} data-active={editor.isActive('italic')} data-tiptap-toolbar-button title="Cursiva" className="h-8 w-8">
          <Italic className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleUnderline().run()} disabled={!editor.can().chain().focus().toggleUnderline().run()} data-active={editor.isActive('underline')} data-tiptap-toolbar-button title="Subrayado" className="h-8 w-8">
          <Underline className="h-4 w-4" />
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleStrike().run()} disabled={!editor.can().chain().focus().toggleStrike().run()} data-active={editor.isActive('strike')} data-tiptap-toolbar-button title="Tachado" className="h-8 w-8">
          <Strikethrough className="h-4 w-4" />
        </Button>

        {/* Block Formatting */}
        <div className="flex items-center gap-1 border-l ml-1 pl-1">
           <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} data-active={editor.isActive('heading', { level: 1 })} data-tiptap-toolbar-button title="Encabezado 1" className="h-8 w-8">
            <Heading1 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} data-active={editor.isActive('heading', { level: 2 })} data-tiptap-toolbar-button title="Encabezado 2" className="h-8 w-8">
            <Heading2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} data-active={editor.isActive('heading', { level: 3 })} data-tiptap-toolbar-button title="Encabezado 3" className="h-8 w-8">
            <Heading3 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBlockquote().run()} data-active={editor.isActive('blockquote')} data-tiptap-toolbar-button title="Cita" className="h-8 w-8">
            <Quote className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBulletList().run()} data-active={editor.isActive('bulletList')} data-tiptap-toolbar-button title="Lista" className="h-8 w-8">
            <List className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleOrderedList().run()} data-active={editor.isActive('orderedList')} data-tiptap-toolbar-button title="Lista numerada" className="h-8 w-8">
            <ListOrdered className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Insertions */}
        <div className="flex items-center gap-1 border-l ml-1 pl-1">
          <Button type="button" variant="ghost" size="icon" onClick={handleOpenLinkDialog} data-active={editor.isActive('link')} data-tiptap-toolbar-button title="Añadir Enlace" className="h-8 w-8">
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onInsertImage} title="Insertar Imagen" className="h-8 w-8">
            <ImageIcon className="h-4 w-4" />
          </Button>
          {onSuggestLinks && (
            <Button type="button" variant="ghost" size="icon" onClick={onSuggestLinks} title="Sugerir Enlaces Internos (IA)" className="h-8 w-8">
              <Link2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        {/* Alignment */}
        <div className="flex items-center gap-1 border-l ml-1 pl-1">
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('left').run()} data-active={editor.isActive({ textAlign: 'left' })} data-tiptap-toolbar-button title="Alinear a la Izquierda" className="h-8 w-8">
            <AlignLeft className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('center').run()} data-active={editor.isActive({ textAlign: 'center' })} data-tiptap-toolbar-button title="Centrar" className="h-8 w-8">
            <AlignCenter className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('right').run()} data-active={editor.isActive({ textAlign: 'right' })} data-tiptap-toolbar-button title="Alinear a la Derecha" className="h-8 w-8">
            <AlignRight className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => editor.chain().focus().setTextAlign('justify').run()} data-active={editor.isActive({ textAlign: 'justify' })} data-tiptap-toolbar-button title="Justificar" className="h-8 w-8">
            <AlignJustify className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <AlertDialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Editar Enlace</AlertDialogTitle>
            <AlertDialogDescription>
              Introduce la URL completa. Para eliminar el enlace, deja el campo vacío.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="link-url-input" className="sr-only">URL</Label>
            <Input
              id="link-url-input"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://ejemplo.com"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSetLink();
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSetLink}>
              Guardar Enlace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
