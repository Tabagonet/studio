
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import { useToast } from "@/hooks/use-toast";
import { auth, onAuthStateChanged } from "@/lib/firebase";
import type { BlogPostData, WordPressPostCategory, ProductPhoto, WordPressUser } from "@/lib/types";
import { Loader2, Sparkles, Wand2, Languages, Edit, Pilcrow, Heading2, List, ListOrdered, CalendarIcon, Info, Tags, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { SeoAnalyzer } from '@/components/features/blog/seo-analyzer';


const ALL_LANGUAGES = [
    { code: 'Spanish', name: 'Español' },
    { code: 'English', name: 'Inglés' },
    { code: 'French', name: 'Francés' },
    { code: 'German', name: 'Alemán' },
    { code: 'Portuguese', name: 'Portugués' },
];

const ContentToolbar = ({ onInsertTag, onInsertLink, onInsertImage }: { onInsertTag: (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => void; onInsertLink: () => void; onInsertImage: () => void; }) => (
    <div className="flex items-center gap-1 mb-1 rounded-t-md border-b bg-muted p-1">
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
    </div>
);


export function Step1Content({ postData, updatePostData }: { postData: BlogPostData; updatePostData: (data: Partial<BlogPostData>) => void; }) {
    const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
    const [authors, setAuthors] = useState<WordPressUser[]>([]);
    const [isLoading, setIsLoading] = useState({ categories: true, authors: true, ai: false });
    
    const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
    const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    
    const contentRef = useRef<HTMLTextAreaElement>(null);
    const selectionRef = useRef<{ start: number; end: number } | null>(null);

    const { toast } = useToast();

    if (!postData) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin" />
            </div>
        );
    }

    const availableTargetLanguages = ALL_LANGUAGES.filter(lang => lang.code !== postData.sourceLanguage);

    useEffect(() => {
        const fetchData = async (token: string) => {
            setIsLoading(prev => ({ ...prev, categories: true, authors: true }));
            try {
                const [catResponse, authorResponse] = await Promise.all([
                    fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                if (catResponse.ok) setCategories(await catResponse.json());
                if (authorResponse.ok) {
                    const authorData = await authorResponse.json();
                    setAuthors(authorData);
                    const user = auth.currentUser;
                    const matchingAuthor = authorData.find((a: WordPressUser) => a.name.toLowerCase() === user?.displayName?.toLowerCase());
                    if (matchingAuthor && !postData.author) {
                        updatePostData({ author: matchingAuthor });
                    }
                }
            } catch (error: any) {
                toast({ title: "Error de Carga", description: error.message, variant: "destructive" });
            } finally {
                setIsLoading(prev => ({ ...prev, categories: false, authors: false }));
            }
        };

        const unsubscribe = onAuthStateChanged(auth, user => {
            if (user) user.getIdToken().then(fetchData);
        });
        return () => unsubscribe();
    }, [toast, updatePostData, postData.author]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updatePostData({ [e.target.name]: e.target.value });
    };
    
    const handlePhotoChange = (photos: ProductPhoto[]) => {
        updatePostData({ featuredImage: photos[0] || null });
    };

    const handleSourceLanguageChange = (newSourceLang: string) => {
        updatePostData({
            sourceLanguage: newSourceLang,
            targetLanguages: postData.targetLanguages.filter(l => l !== newSourceLang)
        });
    };

    const handleLanguageToggle = (langCode: string) => {
        const newLangs = postData.targetLanguages.includes(langCode)
            ? postData.targetLanguages.filter(l => l !== langCode)
            : [...postData.targetLanguages, langCode];
        updatePostData({ targetLanguages: newLangs });
    };

    const handleAIGeneration = async (mode: 'generate_from_topic' | 'enhance_content' | 'suggest_keywords') => {
        setIsLoading(prev => ({ ...prev, ai: true }));
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const payload: any = { mode, language: postData.sourceLanguage };
            if (mode === 'generate_from_topic') {
                if (!postData.topic) throw new Error("Por favor, introduce un tema para la IA.");
                payload.topic = postData.topic;
                payload.keywords = postData.keywords;
            } else { // enhance_content or suggest_keywords
                if (!postData.title || !postData.content) throw new Error("El título y el contenido son necesarios para esta acción.");
                payload.existingTitle = postData.title;
                payload.existingContent = postData.content;
            }

            const response = await fetch('/api/generate-blog-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "La IA no pudo generar el contenido.");
            }

            const aiContent = await response.json();

            // Handle different response structures
            if (mode === 'generate_from_topic') {
                updatePostData({
                    title: aiContent.title,
                    content: aiContent.content,
                    ...(aiContent.suggestedKeywords && { keywords: aiContent.suggestedKeywords })
                });
                toast({ title: "Contenido generado por la IA", description: "Se han rellenado título, contenido y etiquetas." });
            } else if (mode === 'enhance_content') {
                updatePostData({
                    title: aiContent.title,
                    content: aiContent.content
                });
                toast({ title: "Contenido mejorado", description: "Se han actualizado el título y el contenido." });
            } else { // suggest_keywords
                updatePostData({
                    ...(aiContent.suggestedKeywords && { keywords: aiContent.suggestedKeywords })
                });
                toast({ title: "Etiquetas sugeridas", description: "Se han actualizado las etiquetas." });
            }

        } catch (error: any) {
            toast({ title: "Error de IA", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(prev => ({ ...prev, ai: false }));
        }
    };
    
    // --- Toolbar Handlers ---
    const handleInsertTag = (tag: 'h2' | 'ul' | 'ol' | 'strong' | 'em') => {
        const textarea = contentRef.current;
        if (!textarea) return;
        
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        let newText;

        if (tag === 'ul' || tag === 'ol') {
            const listItems = selectedText.split('\\n').map(line => `  <li>${line}</li>`).join('\\n');
            newText = `${textarea.value.substring(0, start)}<${tag}>\\n${listItems}\\n</${tag}>${textarea.value.substring(end)}`;
        } else {
            newText = `${textarea.value.substring(0, start)}<${tag}>${selectedText}</${tag}>${textarea.value.substring(end)}`;
        }
        
        updatePostData({ content: newText });
    };

    const openActionDialog = (action: 'link' | 'image') => {
        const textarea = contentRef.current;
        if (textarea) {
            selectionRef.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
            if (action === 'link') setIsLinkDialogOpen(true);
            if (action === 'image') setIsImageDialogOpen(true);
        }
    };

    const handleInsertLink = () => {
        const textarea = contentRef.current;
        const selection = selectionRef.current;
        if (!textarea || !selection || !linkUrl) return;
        
        const { start, end } = selection;
        const selectedText = textarea.value.substring(start, end);
        
        if (!selectedText) {
            toast({ title: 'Selecciona texto primero', description: 'Debes seleccionar el texto que quieres convertir en un enlace.', variant: 'destructive' });
            return;
        }

        const newText = `${textarea.value.substring(0, start)}<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${selectedText}</a>${textarea.value.substring(end)}`;
        
        updatePostData({ content: newText });
        setLinkUrl('');
        setIsLinkDialogOpen(false);
    };

    const handleInsertImage = async () => {
        let finalImageUrl = imageUrl;

        if (imageFile) {
            setIsUploadingImage(true);
            try {
                const user = auth.currentUser;
                if (!user) throw new Error("No autenticado.");
                const token = await user.getIdToken();

                const formData = new FormData();
                formData.append('imagen', imageFile);

                const response = await fetch('/api/upload-image', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: formData,
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Fallo en la subida de imagen.');
                }
                
                const imageData = await response.json();
                finalImageUrl = imageData.url;

            } catch (err: any) {
                toast({ title: 'Error al subir imagen', description: err.message, variant: 'destructive' });
                setIsUploadingImage(false);
                return;
            } finally {
                setIsUploadingImage(false);
            }
        }

        if (!finalImageUrl) {
            toast({ title: 'Falta la imagen', description: 'Por favor, sube un archivo o introduce una URL.', variant: 'destructive' });
            return;
        }

        const textarea = contentRef.current;
        const selection = selectionRef.current;
        if (!textarea || !selection) return;

        const { start } = selection;
        const newText = `${textarea.value.substring(0, start)}\\n<img src="${finalImageUrl}" alt="${postData.title || 'Imagen insertada'}" loading="lazy" style="max-width: 100%; height: auto; border-radius: 8px;" />\\n${textarea.value.substring(start)}`;
        
        updatePostData({ content: newText });

        setImageUrl('');
        setImageFile(null);
        setIsImageDialogOpen(false);
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main content column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Editor de Contenido y Asistente IA</CardTitle>
                             <CardDescription>Escribe tu entrada y usa la IA para generar, mejorar o etiquetar tu contenido.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <Label htmlFor="title">Título de la Entrada</Label>
                                <Input id="title" name="title" value={postData.title} onChange={handleInputChange} placeholder="El título de tu entrada" />
                            </div>
                            <div>
                                <Label htmlFor="content">Contenido</Label>
                                <ContentToolbar onInsertTag={handleInsertTag} onInsertLink={() => openActionDialog('link')} onInsertImage={() => openActionDialog('image')} />
                                <Textarea id="content" name="content" ref={contentRef} value={postData.content} onChange={handleInputChange} rows={30} placeholder="El cuerpo de tu entrada de blog..." className="rounded-t-none" />
                            </div>

                             <div className="space-y-4 pt-6 border-t">
                                <h3 className="text-sm font-medium text-muted-foreground">Asistente IA</h3>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label htmlFor="topic">1. Generar desde un tema</Label>
                                    <Input id="topic" name="topic" value={postData.topic} onChange={handleInputChange} placeholder="Ej: Las 5 mejores plantas de interior" />
                                    <Button onClick={() => handleAIGeneration('generate_from_topic')} disabled={isLoading.ai || !postData.topic} className="w-full">
                                        {isLoading.ai ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                        Generar Borrador con Etiquetas
                                    </Button>
                                </div>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label>2. Mejorar o etiquetar contenido existente</Label>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <Button onClick={() => handleAIGeneration('enhance_content')} disabled={isLoading.ai || !postData.content} className="w-full">
                                            {isLoading.ai ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                                            Mejorar Contenido
                                        </Button>
                                        <Button onClick={() => handleAIGeneration('suggest_keywords')} disabled={isLoading.ai || !postData.content} className="w-full" variant="outline">
                                            {isLoading.ai ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Tags className="mr-2 h-4 w-4" />}
                                            Sugerir Etiquetas
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                {/* Sidebar column */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader><CardTitle>Publicación y Traducción</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div>
                                <Label>Autor</Label>
                                <Select name="author" value={postData.author?.id.toString() || ''} onValueChange={(value) => {
                                    const selectedAuthor = authors.find(a => a.id.toString() === value);
                                    updatePostData({ author: selectedAuthor || null });
                                }} disabled={isLoading.authors}>
                                    <SelectTrigger><SelectValue placeholder="Selecciona un autor..." /></SelectTrigger>
                                    <SelectContent>
                                        {authors.map(author => <SelectItem key={author.id} value={author.id.toString()}>{author.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Fecha de Publicación</Label>
                                <Popover>
                                    <PopoverTrigger asChild>
                                    <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {postData.publishDate ? format(postData.publishDate, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                    </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={postData.publishDate || undefined} onSelect={(date) => updatePostData({ publishDate: date || null })} initialFocus /></PopoverContent>
                                </Popover>
                                <p className="text-xs text-muted-foreground mt-1">Si se deja en blanco, se publicará con la fecha actual.</p>
                            </div>
                            <div className="space-y-3 pt-4 border-t">
                                <Label>Idioma de la Entrada Original</Label>
                                <Select name="sourceLanguage" value={postData.sourceLanguage} onValueChange={handleSourceLanguageChange}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {ALL_LANGUAGES.map(lang => (<SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3 pt-4 border-t">
                                <Label>Crear traducciones en:</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {availableTargetLanguages.map(lang => (
                                        <div key={lang.code} className="flex items-center space-x-2">
                                            <Checkbox id={`lang-${lang.code}`} checked={postData.targetLanguages.includes(lang.code)} onCheckedChange={() => handleLanguageToggle(lang.code)} />
                                            <Label htmlFor={`lang-${lang.code}`} className="font-normal">{lang.name}</Label>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                     <Card>
                        <CardHeader>
                            <CardTitle>Análisis SEO</CardTitle>
                            <CardDescription>Introduce una palabra clave para ver recomendaciones.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label htmlFor="focusKeyword">Palabra Clave Principal</Label>
                                <Input 
                                    id="focusKeyword" 
                                    name="focusKeyword" 
                                    value={postData.focusKeyword} 
                                    onChange={handleInputChange} 
                                    placeholder="Ej: Jardinería sostenible" 
                                />
                            </div>
                            <SeoAnalyzer 
                                title={postData.title}
                                content={postData.content}
                                focusKeyword={postData.focusKeyword}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Organización</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Categoría</Label>
                                <Select name="category" value={postData.category?.id.toString() || ''} onValueChange={(value) => {
                                    const selectedCategory = categories.find(c => c.id.toString() === value);
                                    updatePostData({ category: selectedCategory || null });
                                }} disabled={isLoading.categories}>
                                    <SelectTrigger><SelectValue placeholder="Selecciona una categoría..." /></SelectTrigger>
                                    <SelectContent>
                                        {categories.map(cat => <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label>Etiquetas (separadas por comas)</Label>
                                <Input name="keywords" value={postData.keywords} onChange={handleInputChange} placeholder="Ej: SEO, marketing, WordPress" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Imagen Destacada</CardTitle></CardHeader>
                        <CardContent>
                            <ImageUploader photos={postData.featuredImage ? [postData.featuredImage] : []} onPhotosChange={handlePhotoChange} isProcessing={false} />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* DIALOGS */}
            <AlertDialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Añadir Enlace</AlertDialogTitle>
                        <AlertDialogDescription>Introduce la URL completa a la que quieres enlazar el texto seleccionado.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input 
                        value={linkUrl} 
                        onChange={(e) => setLinkUrl(e.target.value)} 
                        placeholder="https://ejemplo.com" 
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleInsertLink(); } }}
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setLinkUrl('')}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleInsertLink}>Añadir Enlace</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Insertar Imagen</AlertDialogTitle>
                        <AlertDialogDescription>Sube una imagen o introduce una URL para insertarla en el contenido.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="image-upload">Subir archivo</Label>
                            <Input id="image-upload" type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} />
                        </div>
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground">O</span>
                            </div>
                        </div>
                        <div>
                            <Label htmlFor="image-url">Insertar desde URL</Label>
                            <Input id="image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://ejemplo.com/imagen.jpg" />
                        </div>
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setImageUrl(''); setImageFile(null); }}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={handleInsertImage} disabled={isUploadingImage}>
                            {isUploadingImage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Insertar Imagen
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
