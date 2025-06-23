
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { AppLayout } from "@/components/core/app-layout";
import { Loader2 } from 'lucide-react'; 

type AuthStatus = 'loading' | 'authorized' | 'pending_approval' | 'rejected' | 'unauthenticated';

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (user) {
        try {
            // Force refresh the token to ensure it's not stale. This prevents 401 errors on fast reloads.
            const token = await user.getIdToken(true);
            const response = await fetch('/api/user/verify', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                // If API fails, treat as unauthenticated to force re-login
                throw new Error(`Verification failed with status: ${response.status}`);
            }

            const userData = await response.json();
            
            if (userData.status === 'pending_approval') {
                setAuthStatus('pending_approval');
                router.replace('/pending-approval');
            } else if (userData.status === 'rejected') {
                setAuthStatus('rejected');
                router.replace('/access-denied');
            } else if (userData.status === 'active' && (userData.role === 'user' || userData.role === 'admin')) {
                setAuthStatus('authorized');
            } else {
                // Any other case is treated as an issue, redirect to login
                setAuthStatus('unauthenticated');
                router.replace('/login');
            }

        } catch (error) {
            console.error("Error verifying user role:", error);
            setAuthStatus('unauthenticated');
            router.replace('/login');
        }
      } else {
        // No user, redirect to login
        setAuthStatus('unauthenticated');
        router.replace('/login'); 
      }
    });

    return () => unsubscribe(); 
  }, []);
  
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
