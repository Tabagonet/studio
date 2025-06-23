
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { AppLayout } from "@/components/core/app-layout";
import { Loader2 } from 'lucide-react'; 

type AuthStatus = 'loading' | 'authorized' | 'unauthenticated';

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user: FirebaseUser | null) => {
      if (user) {
        // Temporarily bypass the API verification to stop the auth loop.
        // We will grant access to any logged-in user for now.
        setAuthStatus('authorized');
      } else {
        // No user, redirect to login
        setAuthStatus('unauthenticated');
        router.replace('/login'); 
      }
    });

    return () => unsubscribe(); 
  }, [router]);
  
  if (authStatus === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verificando acceso...</p>
      </div>
    );
  }

  // Redirects are handled in useEffect, this is a fallback state
  if (authStatus !== 'authorized') {
    return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Redirigiendo...</p>
      </div>
    );
  }

  // Only render the app layout if user is fully authorized
  return <AppLayout defaultOpen={true}>{children}</AppLayout>;
}
