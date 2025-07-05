"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { Loader2 } from 'lucide-react'; 

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (!user) {
        router.replace('/login');
        return;
      }
      
      try {
        const token = await user.getIdToken(true);
        const response = await fetch('/api/user/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const userData = await response.json();
          // Allow both 'admin' and 'super_admin' to access settings
          if (['admin', 'super_admin'].includes(userData.role)) {
            setIsAuthorized(true);
          } else {
            router.replace('/dashboard'); 
          }
        } else {
            router.replace('/dashboard');
        }
      } catch (error) {
        console.error("Settings layout check failed:", error);
        router.replace('/dashboard');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verificando permisos de administrador...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
        <div className="flex h-full w-full items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Acceso denegado. Redirigiendo...</p>
        </div>
    );
  }

  return <>{children}</>;
}
