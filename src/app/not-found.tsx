
"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Frown, ArrowLeft } from 'lucide-react';
import { usePathname } from 'next/navigation';

export default function NotFound() {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
            <Frown className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="mt-4 text-3xl font-bold">Error 404</CardTitle>
          <CardDescription>
            La página que buscas no existe o ha sido movida.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            No hemos podido encontrar la ruta: <code className="bg-muted px-1.5 py-1 rounded-sm text-foreground">{pathname}</code>
          </p>
          <Button asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver al Panel de Control
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
