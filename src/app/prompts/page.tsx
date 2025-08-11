"use client";
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page is a duplicate and causes a build error.
// Its content is replaced by a simple redirect to avoid the conflict.
export default function DuplicatePromptsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
