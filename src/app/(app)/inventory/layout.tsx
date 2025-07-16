
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { Loader2 } from 'lucide-react'; 

export default function InventoryLayout({
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
          // ONLY Super Admins can access this page for now
          if (userData.role === 'super_admin') {
            setIsAuthorized(true);
          } else {
            router.replace('/dashboard'); 
          }
        } else {
            router.replace('/dashboard');
        }
      } catch (error) {
        console.error("Inventory layout check failed:", error);
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
        <p className="ml-4 text-lg text-muted-foreground">Verificando permisos de super administrador...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    // This state is briefly visible during redirection
    return (
        <div className="flex h-full w-full items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-4 text-lg text-muted-foreground">Acceso denegado. Redirigiendo...</p>
        </div>
    );
  }

  return <>{children}</>;
}
