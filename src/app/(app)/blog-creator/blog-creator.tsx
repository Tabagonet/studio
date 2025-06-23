
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
import type { BlogPostData, WordPressPostCategory, ProductPhoto } from "@/lib/types";
import { Loader2, Sparkles, Rocket, CheckCircle, ExternalLink } from "lucide-react";
import Link from 'next/link';

const INITIAL_BLOG_DATA: BlogPostData = {
    title: '',
    content: '',
    topic: '',
    keywords: '',
    categoryId: null,
    status: 'draft',
    featuredImage: null
};


export function BlogCreator() {
    const [postData, setPostData] = useState<BlogPostData>(INITIAL_BLOG_DATA);
    const [categories, setCategories] = useState<WordPressPostCategory[]>([]);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createdPostUrl, setCreatedPostUrl] = useState<string | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchCategories = async (token: string) => {
            setIsLoadingCategories(true);
            try {
                const response = await fetch('/api/wordpress/post-categories', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error("No se pudieron cargar las categorías.");
                setCategories(await response.json());
            } catch (error: any) {
                toast({ title: "Error", description: error.message, variant: "destructive" });
            } finally {
                setIsLoadingCategories(false);
            }
        };

        const unsubscribe = onAuthStateChanged(auth, user => {
            if (user) user.getIdToken().then(fetchCategories);
        });
        return () => unsubscribe();
    }, [toast]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setPostData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSelectChange = (name: string, value: string) => {
        setPostData(prev => ({ ...prev, [name]: value }));
    };

    const handlePhotoChange = (photos: ProductPhoto[]) => {
        setPostData(prev => ({ ...prev, featuredImage: photos[0] || null }));
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
                body: JSON.stringify({ topic: postData.topic, keywords: postData.keywords })
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
        setCreatedPostUrl(null);
        
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
            setCreatedPostUrl(result.post_url);
            toast({ title: "¡Entrada Creada!", description: `"${result.data.title.rendered}" se ha guardado como borrador.`});
            // Don't reset form, let user see the success state
        } catch (error: any) {
            toast({ title: "Error al Crear", description: error.message, variant: "destructive" });
             setIsCreating(false);
        }
    };
    
    const resetForm = () => {
        setPostData(INITIAL_BLOG_DATA);
        setIsCreating(false);
        setCreatedPostUrl(null);
    };

    if (isCreating) {
        return (
            <Card>
                <CardHeader className="text-center">
                    <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
                    <CardTitle className="mt-4">Creando Entrada...</CardTitle>
                    <CardDescription>Estamos guardando tu entrada en WordPress. Por favor, espera.</CardDescription>
                </CardHeader>
            </Card>
        );
    }
    
     if (createdPostUrl) {
        return (
            <Card>
                <CardHeader className="text-center">
                    <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
                    <CardTitle className="mt-4">¡Entrada Creada con Éxito!</CardTitle>
                    <CardDescription>Tu entrada ha sido guardada como borrador en WordPress.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col sm:flex-row items-center justify-center gap-4">
                     <Button onClick={resetForm}>
                        <Rocket className="mr-2 h-4 w-4" /> Crear otra entrada
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={createdPostUrl} target="_blank" rel="noopener noreferrer">
                           <ExternalLink className="mr-2 h-4 w-4" /> Ver borrador en WordPress
                        </Link>
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
                        <CardTitle>Organización</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                             <Label htmlFor="categoryId">Categoría</Label>
                             <Select name="categoryId" onValueChange={(value) => handleSelectChange('categoryId', value)} disabled={isLoadingCategories}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona una categoría..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {isLoadingCategories ? <SelectItem value="loading" disabled>Cargando...</SelectItem> :
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
                    Crear Entrada como Borrador
                </Button>
            </div>
        </div>
    );
}

