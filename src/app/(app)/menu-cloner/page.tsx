
// src/app/(app)/menu-cloner/page.tsx

"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Copy, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Language } from '@/lib/types';


interface Menu {
  id: number;
  name: string;
  slug: string;
}

export default function MenuClonerPage() {
    const [menus, setMenus] = useState<Menu[]>([]);
    const [languages, setLanguages] = useState<Language[]>([]);
    const [selectedMenu, setSelectedMenu] = useState<string>('');
    const [targetLang, setTargetLang] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);
    const [isCloning, setIsCloning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        const user = auth.currentUser;
        if (!user) {
            setError("Debes iniciar sesión para usar esta función.");
            setIsLoading(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const [menusResponse, langsResponse] = await Promise.all([
                fetch('/api/wordpress/menu', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/wordpress/get-languages', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            
            if (!menusResponse.ok) throw new Error((await menusResponse.json()).error || 'No se pudieron cargar los menús.');
            if (!langsResponse.ok) console.warn('Could not load Polylang languages.');
            
            const menusData = await menusResponse.json();
            const langsData = await langsResponse.json();
            
            setMenus(menusData);
            setLanguages(langsData || []);

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
          if (user) fetchData();
        });
         window.addEventListener('connections-updated', fetchData);
        return () => {
          unsubscribe();
          window.removeEventListener('connections-updated', fetchData);
        };
    }, [fetchData]);

    const handleCloneMenu = async () => {
        if (!selectedMenu || !targetLang) {
            toast({ title: 'Datos incompletos', description: 'Por favor, selecciona un menú de origen y un idioma de destino.', variant: 'destructive' });
            return;
        }

        setIsCloning(true);
        const user = auth.currentUser;
        if (!user) {
            toast({ title: 'No autenticado', variant: 'destructive' });
            setIsCloning(false);
            return;
        }

        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/wordpress/menu-cloner/clone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ menuId: Number(selectedMenu), targetLang }),
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Fallo al clonar el menú.');
            }

            toast({ title: '¡Menú Clonado!', description: result.message });
            fetchData(); // Refresh menus list

        } catch (err: any) {
            toast({ title: 'Error al Clonar', description: err.message, variant: 'destructive' });
        } finally {
            setIsCloning(false);
        }
    };

    return (
        <div className="container mx-auto py-8 space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center space-x-3">
                        <Copy className="h-8 w-8 text-primary" />
                        <div>
                            <CardTitle>Clonador de Menús de Navegación</CardTitle>
                            <CardDescription>Duplica la estructura de un menú a otro idioma, enlazando automáticamente a las páginas y entradas traducidas.</CardDescription>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Iniciar Proceso de Clonación</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    {isLoading ? (
                        <div className="flex justify-center items-center h-24">
                            <Loader2 className="h-8 w-8 animate-spin" />
                        </div>
                    ) : error ? (
                         <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error al cargar datos</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                            <div>
                                <Label htmlFor="menu-select">1. Selecciona el menú de origen</Label>
                                <Select value={selectedMenu} onValueChange={setSelectedMenu}>
                                    <SelectTrigger id="menu-select">
                                        <SelectValue placeholder="Elige un menú..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {menus.map(menu => (
                                            <SelectItem key={menu.id} value={menu.id.toString()}>{menu.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label htmlFor="lang-select">2. Selecciona el idioma de destino</Label>
                                <Select value={targetLang} onValueChange={setTargetLang}>
                                    <SelectTrigger id="lang-select">
                                        <SelectValue placeholder="Elige un idioma..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {languages.map(lang => (
                                            <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                    <Button onClick={handleCloneMenu} disabled={isLoading || isCloning || !selectedMenu || !targetLang}>
                        {isCloning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                        {isCloning ? 'Clonando...' : 'Clonar y Traducir Menú'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
