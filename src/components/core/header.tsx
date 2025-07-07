// src/components/core/header.tsx
"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { UserCircle, LogOut, Settings as SettingsIcon, Globe, Bell, Loader2, Store, PlugZap } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { auth, firebaseSignOut, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { Skeleton } from '../ui/skeleton';
import type { UserNotification } from '@/lib/types';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import { cn } from '@/lib/utils';
import { ShopifyIcon } from './icons';

interface ConfigStatus {
    activeStoreUrl: string | null;
    wooCommerceConfigured: boolean;
    wordPressConfigured: boolean;
    shopifyConfigured: boolean;
    pluginActive: boolean;
    activePlatform: 'woocommerce' | 'shopify' | null;
}

function getHostname(url: string | null): string | null {
    if (!url) return null;
    try {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        const parsedUrl = new URL(fullUrl);
        return parsedUrl.hostname.replace(/^www\./, '');
    } catch (e) {
        return url; // Fallback to the original string if URL parsing fails
    }
}

const ConnectionStatusIndicator = ({ status, isLoading }: { status: ConfigStatus | null, isLoading: boolean }) => {
  if (isLoading) {
    return <Skeleton className="h-5 w-40 hidden md:block" />;
  }

  if (!status || !status.activeStoreUrl) {
    return (
      <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Configurar conexión">
        <Globe className="h-4 w-4 text-destructive" />
        <span className="hidden md:inline">No conectado</span>
      </Link>
    );
  }
  
  const hostname = getHostname(status.activeStoreUrl);

  return (
    <TooltipProvider delayDuration={100}>
        <Link href="/settings/connections" className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Gestionar conexiones">
            <span className="hidden md:inline font-medium">{hostname}</span>
            
            <div className="flex items-center gap-2 flex-shrink-0">
                {status.activePlatform === 'woocommerce' && (
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger>
                            <Store className={cn("h-4 w-4", status.wooCommerceConfigured ? "text-green-500" : "text-destructive")} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>WooCommerce: {status.wooCommerceConfigured ? "Configurado" : "No Configurado"}</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger>
                            <Globe className={cn("h-4 w-4", status.wordPressConfigured ? "text-green-500" : "text-destructive")} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>WordPress: {status.wordPressConfigured ? "Configurado" : "No Configurado"}</p>
                            </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger>
                            <PlugZap className={cn("h-4 w-4", status.pluginActive ? "text-green-500" : "text-destructive")} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Plugin AutoPress AI: {status.pluginActive ? "Activo" : "No Detectado"}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}
                {status.activePlatform === 'shopify' && (
                    <div className="flex items-center gap-2">
                        <Tooltip>
                            <TooltipTrigger>
                            <ShopifyIcon className={cn("h-4 w-4", status.shopifyConfigured ? "text-green-500" : "text-destructive")} />
                            </TooltipTrigger>
                            <TooltipContent>
                                <p>Shopify: {status.shopifyConfigured ? "Configurado" : "No Configurado"}</p>
                            </TooltipContent>
                        </Tooltip>
                    </div>
                )}
            </div>
        </Link>
    </TooltipProvider>
  );
};


export function Header() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);

  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationLoading, setIsNotificationLoading] = useState(true);

  const fetchNotifications = useCallback(async (user: FirebaseUser | null) => {
    if (user) {
        setIsNotificationLoading(true);
        try {
            const token = await user.getIdToken();
            const response = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                const sortedNotifications = data.notifications.sort((a: UserNotification, b: UserNotification) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                );
                setNotifications(sortedNotifications);
                setUnreadCount(sortedNotifications.filter((n: UserNotification) => !n.read).length);
            }
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
            toast({
                title: "Error de Notificaciones",
                description: "No se pudieron cargar las notificaciones desde el servidor.",
                variant: "destructive"
            });
        } finally {
            setIsNotificationLoading(false);
        }
    } else {
        setNotifications([]);
        setUnreadCount(0);
        setIsNotificationLoading(false);
    }
  }, [toast]);

  const fetchConnectionStatus = useCallback(async (user: FirebaseUser | null) => {
    if (user) {
      setIsLoadingStatus(true);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/check-config', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          const data = await response.json();
          setConfigStatus({
            activeStoreUrl: data.activeStoreUrl,
            wooCommerceConfigured: data.wooCommerceConfigured,
            wordPressConfigured: data.wordPressConfigured,
            shopifyConfigured: data.shopifyConfigured,
            pluginActive: data.pluginActive,
            activePlatform: data.activePlatform,
          });
        } else {
          setConfigStatus(null);
        }
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
        toast({
            title: "Error de Conexión",
            description: "No se pudo conectar con el servidor para verificar el estado de la conexión. Revisa tu conexión a internet.",
            variant: "destructive",
        });
        setConfigStatus(null);
      } finally {
        setIsLoadingStatus(false);
      }
    } else {
      setConfigStatus(null);
      setIsLoadingStatus(false);
    }
  }, [toast]);


  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsLoadingAuth(false);
      fetchConnectionStatus(user);
      fetchNotifications(user);
    });

    const handleConnectionsUpdate = () => {
      fetchConnectionStatus(auth.currentUser);
    };

    window.addEventListener('connections-updated', handleConnectionsUpdate);

    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, [fetchConnectionStatus, fetchNotifications]);

  const handleMarkAsRead = async () => {
    if (unreadCount === 0) return;
    
    setUnreadCount(0);
    const user = auth.currentUser;
    if (!user) return;
    try {
        const token = await user.getIdToken();
        await fetch('/api/notifications', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    } catch (error) {
        console.error("Failed to mark notifications as read:", error);
    }
  };

  const handleSignOut = async () => {
    try {
      await firebaseSignOut(auth);
      toast({
        title: "Sesión Cerrada",
        description: "Has cerrado sesión exitosamente.",
      });
      router.push('/login'); 
    } catch (error: any) {
      console.error("Error signing out:", error);
      toast({
        title: "Error al Cerrar Sesión",
        description: error.message || "No se pudo cerrar la sesión. Inténtalo de nuevo.",
        variant: "destructive",
      });
    }
  };


  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          {/* Placeholder for logo if needed, or remove for cleaner look */}
        </div>
        
        <div className="md:hidden">
          <SidebarTrigger />
        </div>

        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <ConnectionStatusIndicator status={configStatus} isLoading={isLoadingAuth || isLoadingStatus} />

          <nav className="flex items-center space-x-1">

            <DropdownMenu onOpenChange={(open) => { if (open) handleMarkAsRead(); }}>
              <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                      <Bell className="h-5 w-5" />
                      {unreadCount > 0 && (
                          <span className="absolute top-1.5 right-1.5 flex h-3 w-3">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-3 w-3 bg-destructive"></span>
                          </span>
                      )}
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80 md:w-96" align="end">
                  <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {isNotificationLoading ? (
                      <DropdownMenuItem disabled className="justify-center">
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando...
                      </DropdownMenuItem>
                  ) : notifications.length === 0 ? (
                      <DropdownMenuItem disabled className="justify-center text-center py-4">No tienes notificaciones.</DropdownMenuItem>
                  ) : (
                      <>
                        {notifications.slice(0, 5).map(notification => (
                            <DropdownMenuItem key={notification.id} asChild className="cursor-pointer">
                                <Link href={notification.link || '#'} className="flex flex-col items-start !space-x-0 !p-2">
                                    <div className="flex justify-between w-full">
                                        <p className="font-semibold">{notification.title}</p>
                                        {!notification.read && <div className="h-2 w-2 rounded-full bg-primary flex-shrink-0" />}
                                    </div>
                                    <p className="text-xs text-muted-foreground whitespace-normal">{notification.message}</p>
                                    <p className="text-xs text-muted-foreground/80 mt-1">
                                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: es })}
                                    </p>
                                </Link>
                            </DropdownMenuItem>
                        ))}
                      </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                      <Link href="/notifications" className="justify-center">
                          Ver todas las notificaciones
                      </Link>
                  </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {isLoadingAuth ? (
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" disabled>
                 <UserCircle className="h-6 w-6 animate-pulse" />
              </Button>
            ) : currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    {currentUser.photoURL ? (
                       <Image src={currentUser.photoURL} alt={currentUser.displayName || "User avatar"} fill sizes="36px" className="rounded-full object-cover" data-ai-hint="user avatar" />
                    ) : (
                      <UserCircle className="h-6 w-6" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">
                        {currentUser.displayName || "Usuario"}
                      </p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {currentUser.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/settings"><SettingsIcon className="mr-2 h-4 w-4" />Configuración</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    Cerrar Sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" onClick={() => router.push('/login')}>Iniciar Sesión</Button>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
