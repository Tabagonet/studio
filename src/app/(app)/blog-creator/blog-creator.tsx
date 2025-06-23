
"use client";

import React, { useState, useEffect } from 'react';
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
import { Loader2, Sparkles, Rocket, CheckCircle, ExternalLink, Globe, CalendarIcon } from "lucide-react";
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';

const INITIAL_BLOG_DATA: BlogPostData = {
    title: '',
    content: '',
    topic: '',
    keywords: '',
    categoryId: null,
    status: 'draft',
    featuredImage: null,
    sourceLanguage: 'Spanish',
    targetLanguages: [],
    authorId: null,
    publishDate: null,
};

const ALL_LANGUAGES = [
    { code: 'Spanish', name: 'Español' },
    { code: 'English', name: 'Inglés' },
    { code: 'French', name: 'Francés' },
    { code: 'German', name: 'Alemán' },
    { code: 'Portuguese', name: 'Portugués' },
];

export function BlogCreator() {
    const [postData, setPostData] = useState<BlogPostData>(INITIAL_BLOG_DATA);
    const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
    const [authors, setAuthors] = useState<WordPressUser[]>([]);
    const [isLoading, setIsLoading] = useState({ categories: true, authors: true });
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createdPosts, setCreatedPosts] = useState<{ url: string; title: string }[]>([]);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async (token: string) => {
            setIsLoading(prev => ({ ...prev, categories: true, authors: true }));
            try {
                const [catResponse, authorResponse] = await Promise.all([
                    fetch('/api/wordpress/post-categories', { headers: { 'Authorization': `Bearer ${token}` } }),
                    fetch('/api/wordpress/users', { headers: { 'Authorization': `Bearer ${token}` } })
                ]);

                if (!catResponse.ok) throw new Error("No se pudieron cargar las categorías.");
                setCategories(await catResponse.json());
                setIsLoading(prev => ({ ...prev, categories: false }));

                if (!authorResponse.ok) throw new Error("No se pudieron cargar los autores.");
                const authorData = await authorResponse.json();
                setAuthors(authorData);
                // Set default author to current user if found
                const user = auth.currentUser;
                const matchingAuthor = authorData.find((a: WordPressUser) => a.name.toLowerCase() === user?.displayName?.toLowerCase());
                if (matchingAuthor) {
                    setPostData(prev => ({ ...prev, authorId: matchingAuthor.id }));
                }

                setIsLoading(prev => ({ ...prev, authors: false }));

            } catch (error: any) {
                toast({ title: "Error de Carga", description: error.message, variant: "destructive" });
                 setIsLoading(prev => ({ ...prev, categories: false, authors: false }));
            }
        };

        const unsubscribe = onAuthStateChanged(auth, user => {
            if (user) user.getIdToken().then(fetchData);
        });
        return () => unsubscribe();
    }, [toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setPostData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setPostData(prev => ({ ...prev, [name]: value }));
    };

    const handleSourceLanguageChange = (newSourceLang: string) => {
        setPostData(prev => {
            // Remove the new source language from target languages if it was selected.
            const newTargetLangs = prev.targetLanguages.filter(l => l !== newSourceLang);
            return {
                ...prev,
                sourceLanguage: newSourceLang,
                targetLanguages: newTargetLangs
            };
        });
    };

    const handlePhotoChange = (photos: ProductPhoto[]) => {
        setPostData(prev => ({ ...prev, featuredImage: photos[0] || null }));
    };

    const handleLanguageToggle = (langCode: string) => {
        setPostData(prev => {
            const newLangs = prev.targetLanguages.includes(langCode)
                ? prev.targetLanguages.filter(l => l !== langCode)
                : [...prev.targetLanguages, langCode];
            return { ...prev, targetLanguages: newLangs };
        });
    };

    const handleGenerateContent = async () => {
        if (!postData.topic) {
            toast({ title: "Falta el tema", description: "Por favor, introduce un tema o título para la IA.", variant: "destructive" });
            return;
        }
        setIsGenerating(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();

            const response = await fetch('/api/generate-blog-post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ 
                    topic: postData.topic, 
                    keywords: postData.keywords,
                    language: postData.sourceLanguage 
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "La IA no pudo generar el contenido.");
            }

            const aiContent = await response.json();
            setPostData(prev => ({
                ...prev,
                title: aiContent.title,
                content: aiContent.content
            }));
            toast({ title: "Contenido generado", description: "La IA ha rellenado el título y el contenido de la entrada." });
        } catch (error: any) {
            toast({ title: "Error de IA", description: error.message, variant: "destructive" });
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleCreatePost = async () => {
        if (!postData.title || !postData.content) {
            toast({ title: "Faltan datos", description: "El título y el contenido son obligatorios.", variant: "destructive" });
            return;
        }
        setIsCreating(true);
        setCreatedPosts([]);
        
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("No autenticado.");
            const token = await user.getIdToken();

            const response = await fetch('/api/wordpress/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(postData)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "No se pudo crear la entrada.");
            }

            const result = await response.json();
            setCreatedPosts(result.createdPosts);
            toast({ title: "¡Entradas Creadas!", description: `Se han creado ${result.createdPosts.length} entradas como borrador.`});
        } catch (error: any) {
            toast({ title: "Error al Crear", description: error.message, variant: "destructive" });
             setIsCreating(false);
        }
    };
    
    const resetForm = () => {
        setPostData(INITIAL_BLOG_DATA);
        setIsCreating(false);
        setCreatedPosts([]);
    };
    
    const availableTargetLanguages = ALL_LANGUAGES.filter(lang => lang.code !== postData.sourceLanguage);

    if (isCreating) {
        return (
            <Card>
                <CardHeader className="text-center">
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                    <CardTitle className="mt-4">Creando Entradas...</CardTitle>
                    <CardDescription>Estamos guardando tus entradas en WordPress. Por favor, espera.</CardDescription>
                </CardHeader>
            </Card>
        );
    }
    
     if (createdPosts.length > 0) {
        return (
            <Card>
                <CardHeader className="text-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <CardTitle className="mt-4">¡Entradas Creadas con Éxito!</CardTitle>
                    <CardDescription>
                        Se han guardado como borrador en WordPress. Para enlazarlas, usa el campo personalizado <code className="bg-muted px-1 py-0.5 rounded">translation_group_id</code> en tu plugin de idiomas.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center gap-4">
                     <div className="space-y-2 text-center">
                        {createdPosts.map(post => (
                             <Button variant="link" asChild key={post.url}>
                                <Link href={post.url} target="_blank" rel="noopener noreferrer">
                                   <ExternalLink className="mr-2 h-4 w-4" /> Ver "{post.title}"
                                </Link>
                            </Button>
                        ))}
                    </div>
                     <Button onClick={resetForm}>
                        <Rocket className="mr-2 h-4 w-4" /> Crear otra entrada
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Generador de Contenido IA</CardTitle>
                        <CardDescription>Proporciona un tema y palabras clave para que la IA genere un borrador inicial.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="topic">Tema o Título Inicial</Label>
                            <Input id="topic" name="topic" value={postData.topic} onChange={handleInputChange} placeholder="Ej: Las 5 mejores plantas de interior para principiantes" />
                        </div>
                         <div>
                            <Label htmlFor="keywords">Palabras Clave (separadas por comas)</Label>
                            <Input id="keywords" name="keywords" value={postData.keywords} onChange={handleInputChange} placeholder="Ej: plantas de interior, fácil cuidado, decoración" />
                        </div>
                        <Button onClick={handleGenerateContent} disabled={isGenerating || !postData.topic} className="w-full">
                            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                            {isGenerating ? "Generando..." : "Generar Contenido"}
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                     <CardHeader>
                        <CardTitle>Detalles de la Entrada</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label htmlFor="title">Título de la Entrada</Label>
                            <Input id="title" name="title" value={postData.title} onChange={handleInputChange} placeholder="El título de tu entrada" />
                        </div>
                        <div>
                            <Label htmlFor="content">Contenido</Label>
                            <Textarea id="content" name="content" value={postData.content} onChange={handleInputChange} rows={15} placeholder="El cuerpo de tu entrada de blog..." />
                        </div>
                    </CardContent>
                </Card>
            </div>
            
             <div className="space-y-6">
                <Card>
                    <CardHeader>
                        <CardTitle>Publicación y Traducción</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                         <div>
                             <Label htmlFor="authorId">Autor</Label>
                             <Select name="authorId" value={postData.authorId?.toString() || ''} onValueChange={(value) => handleSelectChange('authorId', value)} disabled={isLoading.authors}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un autor..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {isLoading.authors ? <SelectItem value="loading" disabled>Cargando autores...</SelectItem> :
                                    authors.map(author => <SelectItem key={author.id} value={author.id.toString()}>{author.name}</SelectItem>)
                                    }
                                </SelectContent>
                             </Select>
                        </div>
                        <div>
                            <Label htmlFor="publishDate">Fecha de Publicación</Label>
                             <Popover>
                                <PopoverTrigger asChild>
                                <Button variant={"outline"} className="w-full justify-start text-left font-normal">
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {postData.publishDate ? format(postData.publishDate, "PPP", { locale: es }) : <span>Selecciona una fecha</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={postData.publishDate || undefined}
                                    onSelect={(date) => setPostData(prev => ({ ...prev, publishDate: date || null }))}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                            <p className="text-xs text-muted-foreground mt-1">Si se deja en blanco, se publicará con la fecha actual.</p>
                        </div>
                        <div className="space-y-3 pt-4 border-t">
                            <Label>Idioma de la Entrada Original</Label>
                            <Select name="sourceLanguage" value={postData.sourceLanguage} onValueChange={handleSourceLanguageChange}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {ALL_LANGUAGES.map(lang => (
                                        <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-3 pt-4 border-t">
                             <Label>Crear traducciones en:</Label>
                             <div className="grid grid-cols-2 gap-2">
                                {availableTargetLanguages.map(lang => (
                                    <div key={lang.code} className="flex items-center space-x-2">
                                        <Checkbox 
                                            id={`lang-${lang.code}`}
                                            checked={postData.targetLanguages.includes(lang.code)}
                                            onCheckedChange={() => handleLanguageToggle(lang.code)}
                                        />
                                        <Label htmlFor={`lang-${lang.code}`} className="font-normal">{lang.name}</Label>
                                    </div>
                                ))}
                             </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Organización</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                             <Label htmlFor="categoryId">Categoría</Label>
                             <Select name="categoryId" value={postData.categoryId?.toString() || ''} onValueChange={(value) => handleSelectChange('categoryId', value)} disabled={isLoading.categories}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una categoría..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {isLoading.categories ? <SelectItem value="loading" disabled>Cargando...</SelectItem> :
                                    categories.map(cat => <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>)
                                    }
                                </SelectContent>
                             </Select>
                        </div>
                         <div>
                            <Label htmlFor="tags-input">Etiquetas (separadas por comas)</Label>
                            <Input id="tags-input" name="keywords" value={postData.keywords} onChange={handleInputChange} placeholder="Ej: SEO, marketing, WordPress" />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Imagen Destacada</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ImageUploader
                            photos={postData.featuredImage ? [postData.featuredImage] : []}
                            onPhotosChange={handlePhotoChange}
                            isProcessing={isCreating}
                        />
                    </CardContent>
                </Card>
                 
                <Button onClick={handleCreatePost} disabled={isCreating} size="lg" className="w-full">
                    <Rocket className="mr-2 h-4 w-4" />
                    Crear Entrada(s) como Borrador
                </Button>
            </div>
        </div>
    );
}
