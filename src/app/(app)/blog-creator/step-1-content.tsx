
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from "@/lib/firebase";
import type { BlogPostData, WordPressPostCategory, ProductPhoto, WordPressUser } from "@/lib/types";
import { Loader2, Sparkles, Wand2, Languages, Edit, Pilcrow, Heading2, List, ListOrdered, CalendarIcon, Info, Tags, Link as LinkIcon, Image as ImageIcon, Lightbulb, Check, Strikethrough, Heading3, Bold, Italic, Underline, Quote, AlignCenter, AlignJustify, AlignLeft, AlignRight, Link2, AlertCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';
import { LinkSuggestionsDialog } from '@/components/features/editor/link-suggestions-dialog';
import type { SuggestLinksOutput, LinkSuggestion } from '@/ai/schemas';


const ALL_LANGUAGES = [
    { code: 'Spanish', name: 'Español' },
    { code: 'English', name: 'Inglés' },
    { code: 'French', name: 'Francés' },
    { code: 'German', name: 'Alemán' },
    { code: 'Portuguese', name: 'Portugués' },
];


export function Step1Content({ postData, updatePostData }: { postData: BlogPostData; updatePostData: (data: Partial<BlogPostData>) => void; }) {
    const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
    const [authors, setAuthors] = useState<WordPressUser[]>([]);
    const [isLoading, setIsLoading] = useState({ categories: true, authors: true, ai: false });
    
    const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [isUploadingImage, setIsUploadingImage] = useState(false);
    
    const [ideaKeyword, setIdeaKeyword] = useState('');
    const [suggestedTitles, setSuggestedTitles] = useState<string[]>([]);
    const [isGeneratingIdeas, setIsGeneratingIdeas] = useState(false);

    const [isSuggestingLinks, setIsSuggestingLinks] = useState(false);
    const [linkSuggestions, setLinkSuggestions] = useState<LinkSuggestion[]>([]);

    const [isPolylangActive, setIsPolylangActive] = useState(false);
    
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
                const [catResponse, authorResponse, configResponse] = await Promise.all([
                    fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/check-config', { headers: { 'Authorization': `Bearer ${token}` }})
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
                 if(configResponse.ok) {
                    const configData = await configResponse.json();
                    setIsPolylangActive(configData.pluginActive);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                toast({ title: "Error de Carga", description: errorMessage, variant: "destructive" });
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

    const handleContentChange = (newContent: string) => {
        updatePostData({ content: newContent });
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
    
    const handleGenerateIdeas = async () => {
        if (!ideaKeyword) return;
        setIsGeneratingIdeas(true);
        setSuggestedTitles([]);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();

            const response = await fetch('/api/generate-blog-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ mode: 'suggest_titles', language: postData.sourceLanguage, ideaKeyword })
            });

            if (!response.ok) throw new Error("La IA no pudo generar las ideas.");
            
            const result = await response.json();
            setSuggestedTitles(result.titles || []);

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error de IA", description: errorMessage, variant: "destructive" });
        } finally {
            setIsGeneratingIdeas(false);
        }
    };
    
    const selectIdea = (title: string) => {
        updatePostData({ topic: title });
        setSuggestedTitles([]);
        toast({ title: "Tema seleccionado", description: `"${title}" ha sido copiado al campo de tema.` });
    };


    const handleAIGeneration = async (mode: 'generate_from_topic' | 'enhance_content' | 'suggest_keywords' | 'generate_meta_description') => {
        setIsLoading(prev => ({ ...prev, ai: true }));
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            
            const payload: any = { mode, language: postData.sourceLanguage };
            if (mode === 'generate_from_topic') {
                if (!postData.topic) throw new Error("Por favor, introduce un tema para la IA.");
                payload.topic = postData.topic;
                payload.tags = postData.tags;
            } else {
                if (!postData.title) throw new Error("El título es necesario para esta acción.");
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
            
            if (mode === 'generate_from_topic') {
                updatePostData({
                    title: aiContent.title,
                    content: aiContent.content,
                    metaDescription: aiContent.metaDescription,
                    ...(aiContent.suggestedKeywords && { tags: aiContent.suggestedKeywords })
                });
                toast({ title: "Contenido generado por la IA", description: "Se han rellenado los campos de contenido." });
            } else if (mode === 'enhance_content') {
                updatePostData({
                    title: aiContent.title,
                    content: aiContent.content
                });
                toast({ title: "Contenido mejorado", description: "Se han actualizado el título y el contenido." });
            } else if (mode === 'generate_meta_description') {
                 updatePostData({ metaDescription: aiContent.metaDescription });
                toast({ title: "Meta descripción generada", description: "El campo para buscadores ha sido actualizado." });
            } else { // suggest_keywords
                updatePostData({
                    ...(aiContent.suggestedKeywords && { tags: aiContent.suggestedKeywords })
                });
                toast({ title: "Etiquetas sugeridas", description: "Se han actualizado las etiquetas." });
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            toast({ title: "Error de IA", description: errorMessage, variant: "destructive" });
        } finally {
            setIsLoading(prev => ({ ...prev, ai: false }));
        }
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
              const response = await fetch('/api/upload-image', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData });
              if (!response.ok) throw new Error((await response.json()).error || 'Fallo en la subida de imagen.');
              finalImageUrl = (await response.json()).url;
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

      const imgTag = `<img src="${finalImageUrl}" />`;
      
      setImageUrl('');
      setImageFile(null);
      setIsImageDialogOpen(false);
      toast({ title: 'Imagen lista', description: 'Copiado al portapapeles. Pégala en el editor.' });
      navigator.clipboard.writeText(imgTag);
    };

    const handleSuggestLinks = async () => {
        if (!postData.content.trim()) {
            toast({ title: "Contenido vacío", description: "Escribe algo antes de pedir sugerencias de enlaces.", variant: "destructive" });
            return;
        }
        setIsSuggestingLinks(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();
            const response = await fetch('/api/ai/suggest-links', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ content: postData.content })
            });
            if (!response.ok) throw new Error((await response.json()).message || "La IA falló al sugerir enlaces.");
            
            const data: SuggestLinksOutput = await response.json();
            setLinkSuggestions(data.suggestions || []);

        } catch(e: any) {
            toast({ title: "Error al sugerir enlaces", description: e.message, variant: "destructive" });
            setLinkSuggestions([]);
        } finally {
            setIsSuggestingLinks(false);
        }
    };

    const applyLink = (content: string, suggestion: LinkSuggestion): string => {
        const phrase = suggestion.phraseToLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?<!<a[^>]*>)${phrase}(?!<\\/a>)`, '');
        if (content.match(regex)) {
            return content.replace(regex, `<a href="${suggestion.targetUrl}" target="_blank">${suggestion.phraseToLink}</a>`);
        }
        return content;
    };

    const handleApplySuggestion = (suggestion: LinkSuggestion) => {
        const newContent = applyLink(postData.content, suggestion);
        if (newContent !== postData.content) {
            updatePostData({ content: newContent });
            toast({ title: "Enlace aplicado", description: `Se ha enlazado la frase "${suggestion.phraseToLink}".` });
            setLinkSuggestions(prev => prev.filter(s => s.phraseToLink !== suggestion.phraseToLink || s.targetUrl !== suggestion.targetUrl));
        } else {
            toast({ title: "No se pudo aplicar", description: "No se encontró la frase exacta o ya estaba enlazada.", variant: "destructive" });
        }
    };

    const handleApplyAllSuggestions = () => {
        let updatedContent = postData.content;
        let appliedCount = 0;
        for (const suggestion of linkSuggestions) {
            const newContent = applyLink(updatedContent, suggestion);
            if (newContent !== updatedContent) {
                updatedContent = newContent;
                appliedCount++;
            }
        }
        if (appliedCount > 0) {
            updatePostData({ content: updatedContent });
            toast({ title: "Enlaces aplicados", description: `Se han aplicado ${appliedCount} sugerencias de enlaces.` });
            setLinkSuggestions([]);
        } else {
            toast({ title: "No se aplicó nada", description: "No se encontraron frases o ya estaban enlazadas.", variant: "destructive" });
        }
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Editor de Contenido y Asistente IA</CardTitle>
                             <CardDescription>Usa la IA para generar ideas, crea tu entrada y dale formato.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <div className="space-y-4 pt-6 border-t">
                                <h3 className="text-sm font-medium text-muted-foreground">Asistente IA</h3>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label>1. ¿Sin ideas? Genera títulos desde una palabra clave</Label>
                                     <div className="flex gap-2">
                                        <Input value={ideaKeyword} onChange={(e) => setIdeaKeyword(e.target.value)} placeholder="Ej: Jardinería sostenible" />
                                        <Button onClick={handleGenerateIdeas} disabled={isGeneratingIdeas || !ideaKeyword || isLoading.ai}>
                                            {isGeneratingIdeas ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lightbulb className="mr-2 h-4 w-4" />}
                                            Generar Ideas
                                        </Button>
                                    </div>
                                    {suggestedTitles.length > 0 && (
                                        <div className="space-y-2 pt-2">
                                            {suggestedTitles.map((title, index) => (
                                                <Button key={index} variant="outline" className="w-full justify-start h-auto py-2" onClick={() => selectIdea(title)}>
                                                   <Check className="mr-2 h-4 w-4 text-primary" /> <span className="text-left whitespace-normal">{title}</span>
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label htmlFor="topic">2. Generar borrador desde un tema</Label>
                                    <Input id="topic" name="topic" value={postData.topic} onChange={handleInputChange} placeholder="Pega aquí una idea o escribe la tuya" />
                                    <Button onClick={() => handleAIGeneration('generate_from_topic')} disabled={isLoading.ai || !postData.topic} className="w-full">
                                        {isLoading.ai ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                        Generar Borrador con Etiquetas
                                    </Button>
                                </div>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label>3. Mejorar o etiquetar contenido existente</Label>
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
                            
                            <div className="border-t pt-6 space-y-4">
                                <h3 className="text-lg font-medium">Borrador Actual</h3>
                                <div>
                                    <Label htmlFor="title">Título de la Entrada</Label>
                                    <Input id="title" name="title" value={postData.title} onChange={handleInputChange} placeholder="El título de tu entrada" />
                                </div>
                                <div>
                                    <Label htmlFor="content">Contenido</Label>
                                    <RichTextEditor
                                      content={postData.content}
                                      onChange={handleContentChange}
                                      onInsertImage={() => setIsImageDialogOpen(true)}
                                      onSuggestLinks={handleSuggestLinks}
                                      placeholder="Escribe el contenido de tu entrada o genéralo con IA..."
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
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
                             
                             {isPolylangActive ? (
                                <>
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
                                </>
                            ) : (
                                <Alert variant="default" className="mt-4">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle>Función Multi-idioma Desactivada</AlertTitle>
                                    <AlertDescription>
                                        Para crear traducciones, el plugin Polylang debe estar instalado y activo en tu WordPress.
                                    </AlertDescription>
                                </Alert>
                            )}

                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>SEO</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="metaDescription">Meta Descripción</Label>
                                <Input 
                                    id="metaDescription" 
                                    name="metaDescription" 
                                    value={postData.metaDescription} 
                                    onChange={handleInputChange} 
                                    placeholder="Un resumen atractivo para Google (máx. 160 caracteres)."
                                    maxLength={160}
                                />
                                <div className="flex justify-end">
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => handleAIGeneration('generate_meta_description')}
                                        disabled={isLoading.ai || !postData.content}
                                    >
                                        {isLoading.ai ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                        Generar con IA
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Organización</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <Label>Categoría</Label>
                                <Select name="category" value={postData.category?.id.toString() || ''} onValueChange={(value) => {
                                    const selectedCategory = categories.find(c => c.id.toString() === value);
                                    updatePostData({ category: selectedCategory || null, categoryPath: '' });
                                }} disabled={isLoading.categories}>
                                    <SelectTrigger><SelectValue placeholder="Selecciona una categoría..." /></SelectTrigger>
                                    <SelectContent>
                                        {categories.map(cat => <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">O</span></div>
                            </div>
                            <div>
                                <Label htmlFor="categoryPath">{'Crear Nueva Categoría (Ej: Principal > Subcategoría)'}</Label>
                                <Input
                                    id="categoryPath"
                                    name="categoryPath"
                                    value={postData.categoryPath || ''}
                                    onChange={(e) => updatePostData({ categoryPath: e.target.value, category: null })}
                                    placeholder="Introduce la ruta de la categoría"
                                />
                            </div>

                            <div className="pt-4 border-t">
                                <Label htmlFor="tags">Etiquetas (Palabras Clave)</Label>
                                <Input id="tags" name="tags" value={postData.tags} onChange={handleInputChange} placeholder="Ej: SEO, marketing, WordPress" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><CardTitle>Imagen Destacada</CardTitle></CardHeader>
                        <CardContent>
                            <ImageUploader photos={postData.featuredImage ? [postData.featuredImage] : []} onPhotosChange={handlePhotoChange} isProcessing={false} maxPhotos={1} />
                        </CardContent>
                    </Card>
                </div>
            </div>

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
                                <span className="bg-background px-2 text-muted-foreground">O</span></div>
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
            <LinkSuggestionsDialog
              open={linkSuggestions.length > 0 && !isSuggestingLinks}
              onOpenChange={(open) => { if (!open) setLinkSuggestions([]); }}
              suggestions={linkSuggestions}
              onApplySuggestion={handleApplySuggestion}
              onApplyAll={handleApplyAllSuggestions}
            />
        </>
    );
}
