
"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchCheck } from "lucide-react";
import type { ContentItem } from "@/app/(app)/seo-optimizer/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";


interface SeoPageListTableProps {
  data: ContentItem[];
  onAnalyze: (page: ContentItem) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
}

const getStatusText = (status: ContentItem['status']) => {
    const statusMap: { [key: string]: string } = {
        publish: 'Publicado',
        draft: 'Borrador',
        pending: 'Pendiente',
        private: 'Privado',
        future: 'Programado',
    };
    return statusMap[status] || status;
};

const ContentRow = ({ item, onAnalyze, isChild = false }: { item: ContentItem; onAnalyze: (item: ContentItem) => void; isChild?: boolean }) => (
    <div className={cn(
        "flex items-center gap-4 p-2 rounded-md w-full",
        isChild && "ml-6 border-l-2 border-primary/20 pl-4"
    )}>
        <div className="flex-1 flex items-center gap-2 min-w-0">
            {isChild && <span className="text-muted-foreground">↳</span>}
            <span className="font-medium truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={item.type === 'Post' ? "secondary" : "outline"} className="hidden sm:inline-flex">{item.type}</Badge>
            <Badge variant={item.status === 'publish' ? 'default' : 'secondary'} className="hidden sm:inline-flex">
                {getStatusText(item.status)}
            </Badge>
            <Button onClick={(e) => { e.stopPropagation(); onAnalyze(item); }} size="sm">
                <SearchCheck className="mr-0 md:mr-2 h-4 w-4" />
                <span className="hidden md:inline">Analizar</span>
            </Button>
        </div>
    </div>
);


export function SeoPageListTable({ 
    data, 
    onAnalyze, 
    typeFilter, 
    onTypeFilterChange, 
    statusFilter, 
    onStatusFilterChange 
}: SeoPageListTableProps) {
  const [titleFilter, setTitleFilter] = React.useState('');

  const { pageTree, posts } = React.useMemo(() => {
    const filteredData = data.filter(item => {
        const typeMatch = typeFilter === 'all' || item.type.toLowerCase() === typeFilter;
        const statusMatch = statusFilter === 'all' || item.status === statusFilter;
        const titleMatch = !titleFilter || item.title.toLowerCase().includes(titleFilter.toLowerCase());
        return typeMatch && statusMatch && titleMatch;
    });

    const pages = filteredData.filter((item) => item.type === 'Page');
    const posts = filteredData.filter((item) => item.type === 'Post').sort((a,b) => a.title.localeCompare(b.title));
    
    const pageMap = new Map(pages.map(p => [p.id, { ...p, children: [] as ContentItem[] }]));
    const rootPages: {item: ContentItem, children: ContentItem[]}[] = [];

    pageMap.forEach((page) => {
        if (page.parent && pageMap.has(page.parent)) {
            const parent = pageMap.get(page.parent);
            parent?.children.push(page);
        } else {
            rootPages.push({ item: page, children: page.children });
        }
    });

    rootPages.sort((a,b) => a.item.title.localeCompare(b.item.title));
    rootPages.forEach(p => p.children.sort((a,b) => a.title.localeCompare(b.title)));

    return { pageTree: rootPages, posts };
  }, [data, typeFilter, statusFilter, titleFilter]);

  const NoResults = ({type}: {type: 'page' | 'post'}) => (
    <div className="text-center text-sm text-muted-foreground p-6">
        No se encontraron {type === 'page' ? 'páginas' : 'entradas'} con los filtros actuales.
    </div>
  );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 py-4">
        <Input
          placeholder="Filtrar por título..."
          value={titleFilter}
          onChange={(event) => setTitleFilter(event.target.value)}
          className="max-w-sm"
        />
        <Select value={typeFilter} onValueChange={onTypeFilterChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                <SelectItem value="post">Entradas (Posts)</SelectItem>
                <SelectItem value="page">Páginas</SelectItem>
            </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="all">Todos los Estados</SelectItem>
                <SelectItem value="publish">Publicado</SelectItem>
                <SelectItem value="draft">Borrador</SelectItem>
                <SelectItem value="pending">Pendiente</SelectItem>
                <SelectItem value="private">Privado</SelectItem>
            </SelectContent>
        </Select>
      </div>

       {typeFilter !== 'post' && (
        <Card>
            <CardHeader><CardTitle>Páginas</CardTitle></CardHeader>
            <CardContent>
                {pageTree.length === 0 ? <NoResults type="page"/> : (
                    <Accordion type="multiple" className="w-full">
                        {pageTree.map(({ item: page, children }) => {
                            if (children.length === 0) {
                                return (
                                    <div key={page.id} className="border-b">
                                        <ContentRow item={page} onAnalyze={onAnalyze} />
                                    </div>
                                );
                            }
                            return (
                                <AccordionItem value={`page-${page.id}`} key={page.id}>
                                    <AccordionTrigger className="hover:no-underline p-0">
                                        <ContentRow item={page} onAnalyze={onAnalyze} />
                                    </AccordionTrigger>
                                    <AccordionContent className="pl-4">
                                        {children.map(child => (
                                            <ContentRow key={child.id} item={child} onAnalyze={onAnalyze} isChild={true} />
                                        ))}
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                )}
            </CardContent>
        </Card>
      )}

      {typeFilter !== 'page' && (
        <Card>
            <CardHeader><CardTitle>Entradas (Posts)</CardTitle></CardHeader>
            <CardContent>
                <ScrollArea className="max-h-96">
                    <div className="space-y-1">
                        {posts.length === 0 ? <NoResults type="post"/> : posts.map(post => <div key={post.id} className="border-b"><ContentRow item={post} onAnalyze={onAnalyze} /></div>)}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
      )}

    </div>
  );
}
