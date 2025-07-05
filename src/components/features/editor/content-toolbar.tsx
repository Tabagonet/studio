
'use client';

import { Button } from '@/components/ui/button';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';

interface ContentToolbarProps {
  onInsertTag: (tag: 'h2' | 'h3' | 'blockquote' | 'ul' | 'ol' | 'strong' | 'em' | 'u' | 's') => void;
  onInsertLink: () => void;
  onInsertImage: () => void;
  onAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
}

export function ContentToolbar({ onInsertTag, onInsertLink, onInsertImage, onAlign }: ContentToolbarProps) {
    return (
        <div className="flex items-center gap-1 mb-1 rounded-t-md border-b bg-muted p-1 flex-wrap">
            {/* Text Formatting */}
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('strong')} title="Negrita" className="h-8 w-8">
                <Bold className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('em')} title="Cursiva" className="h-8 w-8">
                 <Italic className="h-4 w-4" />
            </Button>
             <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('u')} title="Subrayado" className="h-8 w-8">
                <Underline className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('s')} title="Tachado" className="h-8 w-8">
                <Strikethrough className="h-4 w-4" />
            </Button>

            {/* Block Formatting */}
            <div className="flex items-center gap-1 border-l ml-1 pl-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('h2')} title="Encabezado H2" className="h-8 w-8">
                    <Heading2 className="h-4 w-4" />
                </Button>
                 <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('h3')} title="Encabezado H3" className="h-8 w-8">
                    <Heading3 className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('blockquote')} title="Cita" className="h-8 w-8">
                    <Quote className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ul')} title="Lista desordenada" className="h-8 w-8">
                    <List className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ol')} title="Lista ordenada" className="h-8 w-8">
                    <ListOrdered className="h-4 w-4" />
                </Button>
            </div>
            
            {/* Insertions */}
             <div className="flex items-center gap-1 border-l ml-1 pl-1">
                <Button type="button" variant="ghost" size="icon" onClick={onInsertLink} title="Añadir Enlace" className="h-8 w-8">
                    <LinkIcon className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={onInsertImage} title="Insertar Imagen" className="h-8 w-8">
                    <ImageIcon className="h-4 w-4" />
                </Button>
            </div>

            {/* Alignment */}
             <div className="flex items-center gap-1 border-l ml-1 pl-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => onAlign('left')} title="Alinear a la Izquierda" className="h-8 w-8">
                    <AlignLeft className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onAlign('center')} title="Centrar" className="h-8 w-8">
                    <AlignCenter className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onAlign('right')} title="Alinear a la Derecha" className="h-8 w-8">
                    <AlignRight className="h-4 w-4" />
                </Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => onAlign('justify')} title="Justificar" className="h-8 w-8">
                    <AlignJustify className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}
