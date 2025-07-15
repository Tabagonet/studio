
"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged, type FirebaseUser } from '@/lib/firebase';
import { AppLayout } from "@/components/core/app-layout";
import { Loader2 } from 'lucide-react'; 

type AuthStatus = 'loading' | 'authorized' | 'unauthenticated' | 'pending_approval' | 'rejected';

export default function AuthenticatedAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user: FirebaseUser | null) => {
      if (!user) {
        setAuthStatus('unauthenticated');
        router.replace('/login'); 
        setIsLoading(false);
        return;
      }

      try {
        const token = await user.getIdToken(true);
        const response = await fetch('/api/user/verify', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            throw new Error(`Verification failed with status: ${response.status}`);
        }
        
        const userData = await response.json();

        switch(userData.status) {
            case 'active':
                setAuthStatus('authorized');
                break;
            case 'pending_approval':
                setAuthStatus('pending_approval');
                router.replace('/pending-approval');
                break;
            case 'rejected':
                setAuthStatus('rejected');
                router.replace('/access-denied');
                break;
            default:
                throw new Error('Unknown user status');
        }

      } catch (error) {
        console.error("Error verifying user role:", error);
        setAuthStatus('unauthenticated');
        router.replace('/login');
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe(); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  if (isLoading || authStatus === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
        <p className="ml-4 text-lg text-muted-foreground">Verificando acceso...</p>
      </div>
    );
  }

  // Redirects are handled in useEffect, this is a fallback state for non-authorized statuses
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
