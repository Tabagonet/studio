
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { UserCircle, LogOut, Settings as SettingsIcon, User as UserIcon, CreditCard, Globe } from "lucide-react";
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

export function Header() {
  const router = useRouter();
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [isLoadingUrl, setIsLoadingUrl] = useState(true);

  useEffect(() => {
    const fetchConnectionStatus = async (user: FirebaseUser | null) => {
        if (user) {
            setIsLoadingUrl(true);
            try {
              const token = await user.getIdToken();
              const response = await fetch('/api/user-settings/connections', {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              if (response.ok) {
                const data = await response.json();
                const activeKey = data.activeConnectionKey;
                const activeConnection = data.allConnections && activeKey ? data.allConnections[activeKey] : null;
                setStoreUrl(activeConnection?.wooCommerceStoreUrl || null);
              } else {
                setStoreUrl(null);
              }
            } catch (error) {
              console.error("Failed to fetch connection status:", error);
              setStoreUrl(null);
            } finally {
              setIsLoadingUrl(false);
            }
        } else {
            setStoreUrl(null);
            setIsLoadingUrl(false);
        }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsLoadingAuth(false);
      fetchConnectionStatus(user);
    });

    const handleConnectionsUpdate = () => {
      fetchConnectionStatus(auth.currentUser);
    };

    window.addEventListener('connections-updated', handleConnectionsUpdate);

    return () => {
        unsubscribe();
        window.removeEventListener('connections-updated', handleConnectionsUpdate);
    };
  }, []);

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

  const renderStoreStatus = () => {
    if (isLoadingAuth || isLoadingUrl) {
      return <Skeleton className="h-5 w-40 hidden md:block" />;
    }

    let statusElement;
    if (storeUrl) {
      try {
        const hostname = new URL(storeUrl).hostname;
        statusElement = (
          <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Cambiar conexión">
            <Globe className="h-4 w-4 text-green-500" />
            <span className="hidden md:inline">{hostname}</span>
          </Link>
        );
      } catch (e) {
        statusElement = (
          <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-destructive" title="URL de tienda inválida. Click para corregir.">
            <Globe className="h-4 w-4" />
            <span className="hidden md:inline">URL Inválida</span>
          </Link>
        );
      }
    } else {
      statusElement = (
        <Link href="/settings/connections" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" title="Configurar conexión">
          <Globe className="h-4 w-4 text-destructive" />
          <span className="hidden md:inline">No conectado</span>
        </Link>
      );
    }
    
    return <div>{statusElement}</div>;
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center">
        <div className="mr-4 hidden md:flex">
          {/* Placeholder for logo if needed, or remove for cleaner look */}
        </div>
        
        <div className="md:hidden">
          <SidebarTrigger />
        </div>

        <div className="flex flex-1 items-center justify-between space-x-4 md:justify-end">
          {renderStoreStatus()}
          <nav className="flex items-center">
            {isLoadingAuth ? (
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" disabled>
                 <UserCircle className="h-6 w-6 animate-pulse" />
              </Button>
            ) : currentUser ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                    {currentUser.photoURL ? (
                       <Image src={currentUser.photoURL} alt={currentUser.displayName || "User avatar"} fill className="rounded-full object-cover" data-ai-hint="user avatar" />
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
                    <Link href="/settings"><UserIcon className="mr-2 h-4 w-4" />Perfil</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                     <Link href="/settings"><CreditCard className="mr-2 h-4 w-4" />Facturación</Link>
                  </DropdownMenuItem>
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
