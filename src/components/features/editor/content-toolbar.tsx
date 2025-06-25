
'use client';

import { Button } from '@/components/ui/button';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Heading2, ImageIcon, Link as LinkIcon, List, ListOrdered, Pilcrow } from 'lucide-react';

interface ContentToolbarProps {
    onInsertTag: (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => void;
    onInsertLink: () => void;
    onInsertImage: () => void;
    onAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
}

export function ContentToolbar({ onInsertTag, onInsertLink, onInsertImage, onAlign }: ContentToolbarProps) {
    return (
        <div className="flex items-center gap-1 mb-1 rounded-t-md border-b bg-muted p-1 flex-wrap">
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('strong')} title="Negrita" className="h-8 w-8">
                <Pilcrow className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('em')} title="Cursiva" className="h-8 w-8">
                <span className="italic text-lg font-serif">I</span>
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('h2')} title="Encabezado H2" className="h-8 w-8">
                <Heading2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ul')} title="Lista desordenada" className="h-8 w-8">
                <List className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => onInsertTag('ol')} title="Lista ordenada" className="h-8 w-8">
                <ListOrdered className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onInsertLink} title="Añadir Enlace" className="h-8 w-8">
                <LinkIcon className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onInsertImage} title="Insertar Imagen" className="h-8 w-8">
                <ImageIcon className="h-4 w-4" />
            </Button>
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
