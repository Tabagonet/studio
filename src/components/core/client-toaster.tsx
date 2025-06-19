// src/components/core/client-toaster.tsx
"use client";

import dynamic from 'next/dynamic';

// Dynamically import the Toaster component with ssr: false
// This ensures it's only rendered on the client-side.
const Toaster = dynamic(() => import('@/components/ui/toaster').then(mod => mod.Toaster), {
  ssr: false,
});

export function ClientToaster() {
  return <Toaster />;
}
