
"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, onAuthStateChanged } from '@/lib/firebase';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true); // Start with loading true

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/dashboard');
      } else {
        router.replace('/login');
      }
      // No need to setIsLoading(false) here, as navigation will occur.
      // If we did, there might be a brief flash of the "loading" state below.
    });

    return () => unsubscribe();
  }, []);

  // This loading state will be shown until onAuthStateChanged makes its first determination
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-3 text-muted-foreground">Inicializando...</p>
    </div>
  );
}
