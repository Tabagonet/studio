
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { AppLayout } from "@/components/core/app-layout";
import { Loader2 } from 'lucide-react'; 

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        router.replace('/login'); 
      }
      setIsLoading(false);
    });

    return () => unsubscribe(); 
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Cargando aplicación...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    // This path should ideally not be reached if the redirect to /login is effective.
    // It serves as a fallback.
    return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Redirigiendo a inicio de sesión...</p>
      </div>
    );
  }

  return <AppLayout defaultOpen={true}>{children}</AppLayout>;
}
