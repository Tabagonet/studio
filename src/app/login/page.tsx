"use client";

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { auth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react'; 
import { useToast } from '@/hooks/use-toast';
import { APP_NAME } from '@/lib/constants';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        router.replace('/dashboard'); 
      } else {
        setIsCheckingAuth(false);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSignInWithGoogle = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      // The onAuthStateChanged listener will handle the redirect.
      toast({
        title: "Inicio de Sesión Exitoso",
        description: "Redirigiendo a tu panel...",
      });
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      toast({
        title: "Error de Inicio de Sesión",
        description: error.message || "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-muted-foreground">Verificando autenticación...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-accent/30 p-4">
      <Card className="w-full max-w-md shadow-2xl rounded-xl">
        <CardHeader className="text-center items-center">
           <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-4 rounded-full">
                <rect width="80" height="80" rx="40" fill="#E6E6FA"/>
                <path d="M25 55L35 25L45 55M40 45H30" stroke="#20B2AA" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M50 55V25M50 25H60C65.5228 25 70 29.4772 70 35C70 40.5228 65.5228 45 60 45H50" stroke="#20B2AA" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          <CardTitle className="text-3xl font-bold tracking-tight font-headline text-foreground">{`Bienvenido a ${APP_NAME}`}</CardTitle>
          <CardDescription className="text-md text-muted-foreground pt-2">
            Inicia sesión para automatizar tu tienda y blog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-8">
          <Button 
            onClick={handleSignInWithGoogle} 
            disabled={isLoading}
            className="w-full text-lg py-6 shadow-md hover:shadow-lg transition-shadow"
            size="lg"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="mr-3 h-6 w-6 fill-current"><title>Google</title><path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.0-1.05 1.05-2.36 1.84-4.0 1.84-4.76 0-8.3-3.73-8.3-8.3s3.54-8.3 8.3-8.3c2.17 0 3.54.74 4.6 1.84l2.44-2.44C19.23 1.58 16.47 0 12.48 0 5.88 0 .02 5.88.02 12.48s5.86 12.48 12.46 12.48c3.32 0 5.7-1.11 7.57-2.92 1.95-1.95 2.6-4.49 2.6-6.65 0-.6-.05-1.11-.15-1.62H12.48Z"/></svg>
            )}
            Iniciar Sesión con Google
          </Button>
          <p className="text-xs text-center text-muted-foreground px-4">
            Al continuar, aceptas nuestros{' '}
            <Link href="/terms" className="underline hover:text-primary">
              Términos de Servicio
            </Link>{' '}
            y nuestra{' '}
            <Link href="/privacy" className="underline hover:text-primary">
              Política de Privacidad
            </Link>
            .
          </p>
        </CardContent>
      </Card>
       <footer className="mt-8 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} {APP_NAME}. Todos los derechos reservados.
      </footer>
    </div>
  );
}
