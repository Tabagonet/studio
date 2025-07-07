
'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Cookie } from 'lucide-react';

const COOKIE_CONSENT_KEY = 'autopress_cookie_consent';

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check localStorage only on the client side
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (consent !== 'true') {
      setShowBanner(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    setShowBanner(false);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="print-hide fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg animate-in slide-in-from-bottom-5">
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <Cookie className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
          <p className="text-sm text-muted-foreground">
            Utilizamos cookies esenciales para el funcionamiento del sitio, como el inicio de sesión. No usamos cookies de seguimiento. Consulta nuestra{' '}
            <Link href="/privacy" className="underline hover:text-primary">
              Política de Privacidad
            </Link>
            .
          </p>
        </div>
        <Button onClick={handleAccept} className="w-full sm:w-auto flex-shrink-0">
          Entendido
        </Button>
      </div>
    </div>
  );
}
