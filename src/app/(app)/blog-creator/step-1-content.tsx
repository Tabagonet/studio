
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUploader } from "@/components/features/wizard/image-uploader";
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from "@/lib/firebase";
import type { BlogPostData, WordPressPostCategory, ProductPhoto, WordPressUser } from "@/lib/types";
import { Loader2, Sparkles, Wand2, Languages, Edit, Pilcrow, Heading2, List, ListOrdered, CalendarIcon, Info, Tags, Link as LinkIcon, Image as ImageIcon, Lightbulb, Check, Strikethrough, Heading3, Bold, Italic, Underline, Quote, AlignCenter, AlignJustify, AlignLeft, AlignRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { RichTextEditor } from '@/components/features/editor/rich-text-editor';


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
                payload.keywords = postData.keywords;
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
                    ...(aiContent.suggestedKeywords && { keywords: aiContent.suggestedKeywords })
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
                    ...(aiContent.suggestedKeywords && { keywords: aiContent.suggestedKeywords })
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

      // This logic will be handled by the RichTextEditor component itself now
      // It's kept here just to manage the dialog.
      // The actual insertion happens within the editor component instance.
      // A more advanced implementation might use a callback to pass the URL to the editor.
      
      setImageUrl('');
      setImageFile(null);
      setIsImageDialogOpen(false);
      toast({ title: 'Imagen lista', description: 'Copiado al portapapeles. Pégala en el editor.' });
      navigator.clipboard.writeText(`<img src="${finalImageUrl}" />`);
    };

    return (
        <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Main content column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Editor de Contenido y Asistente IA</CardTitle>
                             <CardDescription>Usa la IA para generar ideas, crea tu entrada y dale formato.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                             <Alert>
                                <Languages className="h-4 w-4" />
                                <AlertTitle>Nueva Integración con Polylang</AlertTitle>
                                <AlertDescription>
                                    ¡Ahora nos integramos con Polylang! Al seleccionar idiomas de destino, la aplicación creará las traducciones y las enlazará automáticamente a la entrada original en tu WordPress.
                                </AlertDescription>
                            </Alert>
                             <div className="space-y-4 pt-6 border-t">
                                <h3 className="text-sm font-medium text-muted-foreground">Asistente IA</h3>
                                <div className="p-4 border rounded-lg space-y-3 bg-card">
                                    <Label>1. ¿Sin ideas? Genera títulos desde una palabra clave</Label>
                                     <div className="flex gap-2">
                                        <Input value={ideaKeyword} onChange={(e) => setIdeaKeyword(e.target.value)} placeholder="Ej: Jardinería sostenible" />
                                        <Button onClick={handleGenerateIdeas} disabled={isGeneratingIdeas || !ideaKeyword}>
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
                                      placeholder="Escribe el contenido de tu entrada o genéralo con IA..."
                                    />
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
                            <CardTitle>SEO</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="metaDescription">Meta Descripción</Label>
                                <Textarea 
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
                                <Label>Etiquetas (separadas por comas)</Label>
                                <Input name="keywords" value={postData.keywords} onChange={handleInputChange} placeholder="Ej: SEO, marketing, WordPress" />
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

            {/* DIALOGS */}
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
        </>
    );
}
